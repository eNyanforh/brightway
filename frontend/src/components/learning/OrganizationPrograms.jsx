import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { learningApi as api } from "../../api/learning";
import { PROGRAM_STATUSES, CYCLE_STATUSES, cycleStatus } from "../../../../shared/learning.mjs";
import ProgramEditor from "./ProgramEditor";
import CycleEditor from "./CycleEditor";
import "../opportunities/opportunities.css";
import "./learning.css";
export default function OrganizationPrograms({ organization, disabled = false }) {
  const [page, setPage] = useState(null), [cycles, setCycles] = useState(null), [editor, setEditor] = useState(null), [cycleEditor, setCycleEditor] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const request = useRef(null), lock = useRef(false);
  const load = useCallback(async () => {
    if (lock.current) return; lock.current = true; setBusy(true); request.current?.abort(); const c = new AbortController(); request.current = c;
    try { const [programs, admissions] = await Promise.all([api.programs(organization.id, null, c.signal), api.list(organization.id, null, c.signal)]); if (!c.signal.aborted) { setPage(programs); setCycles(admissions); setError(null); } }
    catch (e) { if (!c.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) { setPage(null); setCycles(null); setEditor(null); setCycleEditor(null); } } }
    finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }, [organization.id]);
  useEffect(() => { let mounted = true; queueMicrotask(() => { if (mounted) void load(); }); return () => { mounted = false; request.current?.abort(); }; }, [load]);
  async function action(work, success) {
    if (lock.current) return; lock.current = true; setBusy(true); setNotice(""); const c = new AbortController(); request.current = c;
    try { const result = await work(c.signal); if (!c.signal.aborted) { success(result); setError(null); setNotice("Saved."); } }
    catch (e) { if (!c.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) { setPage(null); setCycles(null); setEditor(null); setCycleEditor(null); } } }
    finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  const blocked = busy || disabled || Boolean(error);
  const merge = (old, row) => ({ ...old, items: old.items.some(r => r.id === row.id) ? old.items.map(r => r.id === row.id ? row : r) : [row, ...old.items] });
  return <section className="bw-op-workspace"><header className="bw-op-workspace-heading"><div><p className="bw-op-eyebrow">GROW THROUGH EDUCATION</p><h2>Programs & admission cycles</h2><p>Publish your offerings globally. Open a new intake for each application period.</p></div><button type="button" className="bw-op-primary" disabled={blocked} onClick={() => setEditor({ new: true })}>+ Create program</button></header>
    {error && <div role="alert" className="bw-op-feedback"><p>{error.message}</p><button type="button" disabled={busy} onClick={() => void load()}>Reload programs</button></div>}{notice && <p role="status">{notice}</p>}
    {!page && !error && <p role="status">Loading programs…</p>}{page?.items.length === 0 && <div className="bw-op-empty"><h3>Share what your organization teaches</h3><p>Create a program, publish it in Discover, then add an admission cycle.</p></div>}
    <div className="bw-op-managed-list">{page?.items.map(p => <article className="bw-op-managed-card" key={p.id}><span className="bw-op-status">{PROGRAM_STATUSES[p.status]}</span><h3>{p.title}</h3><p>{p.field} · {p.duration} · {p.location}, {p.countryCode}</p><div className="bw-op-actions">
      {p.status === "DRAFT" && <><button type="button" disabled={blocked} onClick={() => setEditor(p)}>Edit program</button><button className="bw-op-primary" type="button" disabled={blocked} onClick={() => void action(s => api.programStatus(organization.id, p.id, { expectedVersion: p.version, status: "PUBLISHED" }, s), row => setPage(old => merge(old, row)))}>Publish program</button></>}
      {p.status === "PUBLISHED" && <><Link to={`/learning/programs/${p.id}`}>View program</Link><button className="bw-op-secondary" type="button" disabled={blocked} onClick={() => setCycleEditor({ program: p })}>+ Add admission cycle</button></>}
      {p.status !== "ARCHIVED" && <button type="button" disabled={blocked} onClick={() => { if (window.confirm("Archive this program? New applications will stop. Existing application history will be retained.")) void action(s => api.programStatus(organization.id, p.id, { expectedVersion: p.version, status: "ARCHIVED" }, s), row => setPage(old => merge(old, row))); }}>Archive</button>}
    </div></article>)}</div>
    {page?.nextCursor && <button type="button" disabled={blocked} onClick={() => void action(s => api.programs(organization.id, page.nextCursor, s), data => setPage(old => ({ ...data, items: [...old.items, ...data.items] })))}>More programs</button>}
    <h3>Admission cycles</h3>{cycles?.items.length === 0 && <p>No cycles yet. Add one to a published program.</p>}
    <div className="bw-op-managed-list">{cycles?.items.map(c => <article key={c.id} className="bw-op-managed-card"><span className="bw-op-status">{CYCLE_STATUSES[cycleStatus(c)]}</span><h3>{c.title}</h3><p>{c.program.title}</p><p>{new Date(c.opensAt).toLocaleString("en-GB")} – {new Date(c.deadline).toLocaleString("en-GB")}</p><div className="bw-op-actions">
      {(c.status === "DRAFT" || c.status === "UPCOMING" && cycleStatus(c) === "UPCOMING") && <button type="button" disabled={blocked} onClick={() => setCycleEditor({ program: c.program, cycle: c })}>Edit cycle</button>}
      {c.status === "DRAFT" && c.program.status === "PUBLISHED" && <button className="bw-op-primary" type="button" disabled={blocked} onClick={() => void action(s => api.status(organization.id, c.id, { expectedVersion: c.version, status: new Date(c.opensAt) > new Date() ? "UPCOMING" : "OPEN" }, s), row => setCycles(old => merge(old, row)))}>Publish cycle</button>}
      {["UPCOMING", "OPEN"].includes(c.status) && <><Link to={`/learning/cycles/${c.id}`}>View cycle</Link><button type="button" disabled={blocked} onClick={() => { if (window.confirm("Close this cycle? This cannot be undone.")) void action(s => api.status(organization.id, c.id, { expectedVersion: c.version, status: "CLOSED" }, s), row => setCycles(old => merge(old, row))); }}>Close cycle</button></>}
      {!["CLOSED", "CANCELLED"].includes(c.status) && <button type="button" disabled={blocked} onClick={() => { if (window.confirm("Cancel this cycle? This cannot be undone.")) void action(s => api.status(organization.id, c.id, { expectedVersion: c.version, status: "CANCELLED" }, s), row => setCycles(old => merge(old, row))); }}>Cancel cycle</button>}
    </div></article>)}</div>
    {cycles?.nextCursor && <button type="button" disabled={blocked} onClick={() => void action(s => api.list(organization.id, cycles.nextCursor, s), data => setCycles(old => ({ ...data, items: [...old.items, ...data.items] })))}>More cycles</button>}
    {editor && !disabled && <ProgramEditor key={editor.id || "new"} organizationId={organization.id} program={editor.new ? null : editor} onClose={() => setEditor(null)} onSaved={row => { setPage(old => merge(old, row)); setEditor(null); setNotice("Program draft saved."); }} />}
    {cycleEditor && !disabled && <CycleEditor key={cycleEditor.cycle?.id || "new"} organizationId={organization.id} program={cycleEditor.program} cycle={cycleEditor.cycle} onClose={() => setCycleEditor(null)} onSaved={row => { setCycles(old => merge(old, row)); setCycleEditor(null); setNotice("Admission cycle saved."); }} />}
  </section>;
}

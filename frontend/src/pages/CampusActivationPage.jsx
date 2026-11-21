import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { campusApi } from "../api/campus";
import "./campus-activation.css";
const labels = ["Eligibility Verification", "Campus Identity", "Academic Engines", "Campus Administration"];
const engines = { GRADE_SCHOOL: "Grade School", TVET: "TVET" };
export default function CampusActivationPage({ setup = false }) {
  const { id } = useParams(), { account } = useAuth();
  return <CampusFlow key={`${account?.id}:${id}:${setup}`} id={id} setup={setup} />;
}
export function CampusFlow({ id, setup }) {
  const navigate = useNavigate(), [view, setView] = useState(null), [draft, setDraft] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [saved, setSaved] = useState("");
  const [confirmed, setConfirmed] = useState(false), [revision, setRevision] = useState(0);
  const retry = useRef(null), lock = useRef(false), heading = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    campusApi.onboarding(id, controller.signal).then(data => { if (!controller.signal.aborted) { setView(data); setDraft(data.draft); setError(""); } }).catch(e => { if (!controller.signal.aborted) { setError(e.message); if ([401, 403, 404].includes(e.status)) { setView(null); setDraft(null); setConfirmed(false); } } });
    return () => controller.abort();
  }, [id, revision]);
  useEffect(() => { heading.current?.focus(); }, [draft?.step]);
  async function action(work) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setSaved("");
    try { await work(); } catch (e) { if (alive.current) { setError(e.message); if ([401, 403, 404].includes(e.status)) { setView(null); setDraft(null); setConfirmed(false); retry.current = null; } } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function save(step, exit = false) {
    void action(async () => {
      const body = retry.current || { requestKey: crypto.randomUUID(), expectedVersion: draft.version, step, displayName: draft.displayName, enabledEngines: draft.enabledEngines };
      retry.current = body;
      const next = await campusApi.saveOnboarding(id, body);
      if (!alive.current) return;
      retry.current = null; setConfirmed(false); setDraft(next); setSaved("Progress saved.");
      if (exit) navigate(`/organization-workspace/${id}`);
    });
  }
  const change = values => { retry.current = null; setDraft(d => ({ ...d, ...values })); setSaved(""); };
  const refresh = () => { retry.current = null; setConfirmed(false); setRevision(v => v + 1); };
  const active = view?.campus?.status === "ACTIVE";
  if (active && setup) return <Navigate to={`/campus/${id}`} replace />;
  if (view && !view.campus && !setup) return <Navigate to={`/campus/${id}/setup`} replace />;
  if (view?.campus?.status === "SETUP" && !setup) return <Navigate to={`/campus/${id}/setup`} replace />;
  return <main className="bw-campus-activation">
    <header><Link to="/work" className="bw-campus-brand">BRIGHTWAY</Link><span>Virtual Campus</span><Link to={`/organization-workspace/${id}`}>Organization workspace</Link></header>
    {error && <div role="alert" className="bw-campus-error">{error} <button disabled={busy} onClick={refresh}>Reload saved progress</button></div>}
    {!view ? <p role="status">{error ? "Campus access could not be confirmed." : "Verifying Campus access…"}</p> : active ? <>
      <section className="bw-campus-welcome"><p>INSTITUTIONAL WORKSPACE</p><h1>{view.campus.displayName}</h1><p>Campus Management Workspace</p><span>Managed by {view.organizationName}</span></section>
      <section className="bw-campus-panel"><h2>Academic engines</h2><p>Manage your institution here. Academic operations are configured inside Campus after initial setup.</p>
        <div className="bw-campus-engine-grid">{Object.entries(engines).map(([engine, label]) => <article key={engine}><h3>{label}</h3>{view.campus.enabledEngines.includes(engine) ? <><p>Enabled</p><p>Configuration: {view.campus.engineConfigurations?.find(c => c.engine === engine)?.status === "READY" ? "Ready" : "Academic setup pending"}</p></> : <><p>Add this engine to your existing Campus.</p><button disabled={busy} onClick={() => action(async () => { await campusApi.enableEngine(id, { engine, expectedVersion: view.campus.version }); const next = await campusApi.onboarding(id); if (alive.current) setView(next); })}>Enable {label}</button></>}</article>)}</div>
        <p>Subjects, classes, teachers, intakes, learners, timetables and fees are not prerequisites for workspace access. Operational management screens remain unavailable during this activation preview.</p>
      </section><section className="bw-campus-panel"><h2>Campus administration</h2><p>Primary administrator: @{view.administrator.username}</p><p>Your BrightWay identity and organization membership provide access to this workspace.</p></section>
    </> : !view.eligible || !view.canSetup ? <section className="bw-campus-panel"><h1>Campus is unavailable</h1><ul>{view.eligibility.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p>Active organization eligibility and primary administrator access are required. Paused Campuses must be restored before entering.</p></section> : <>
      <section className="bw-campus-welcome"><p>WELCOME TO YOUR CAMPUS</p><h1>Set up your Virtual Campus</h1><p>Four short steps. Your academic operations come next, inside Campus.</p></section>
      <div className="bw-campus-onboarding-grid"><nav aria-label="Setup progress"><ol>{labels.map((label, i) => <li key={label} aria-current={draft.step === i + 1 ? "step" : undefined}><span>{i + 1}</span>{label}{draft.step > i + 1 && <small>Completed</small>}</li>)}</ol></nav>
      <form className="bw-campus-panel" onSubmit={e => { e.preventDefault(); if (draft.step < 4) save(draft.step + 1); else void action(async () => { const result = await campusApi.completeOnboarding(id, { expectedVersion: draft.version, administratorMembershipId: view.administrator.membershipId, confirmed }); if (alive.current) navigate(result.workspacePath, { replace: true }); }); }}>
        <p>Step {draft.step} of 4</p><h2 ref={heading} tabIndex={-1}>{labels[draft.step - 1]}</h2>
        <fieldset disabled={busy}><legend className="bw-campus-sr">{labels[draft.step - 1]}</legend>
        {draft.step === 1 && <><p>We checked your organization automatically.</p><ul className="bw-campus-checks"><li>Verified and active organization</li><li>Verified operation in Liberia</li><li>Education or training eligibility confirmed</li><li>Authorized primary administrator</li></ul><p>Saving requires a completed organization profile, verified email and current two-factor authentication.</p></>}
        {draft.step === 2 && <><p>Organization: <strong>{view.organizationName}</strong></p><label>Campus display name<input autoComplete="organization" required maxLength={160} value={draft.displayName} onChange={e => change({ displayName: e.target.value })} /></label><p>Your organization’s verified identity remains linked to this Campus.</p></>}
        {draft.step === 3 && <><p>Select one or both. You can add another engine later.</p>{Object.entries(engines).map(([engine, label]) => <label className="bw-campus-choice" key={engine}><input type="checkbox" checked={draft.enabledEngines.includes(engine)} disabled={view.campus?.enabledEngines.includes(engine)} onChange={e => change({ enabledEngines: e.target.checked ? [...draft.enabledEngines, engine] : draft.enabledEngines.filter(v => v !== engine) })} /><span><strong>{label}</strong><small>{engine === "GRADE_SCHOOL" ? "School years, classes and subjects" : "Training programs, intakes and competencies"}</small></span></label>)}</>}
        {draft.step === 4 && <><p><strong>{draft.displayName}</strong></p><p>{draft.enabledEngines.map(e => engines[e]).join(" · ")}</p><p>Initial Campus administrator: <strong>@{view.administrator.username}</strong></p><label className="bw-campus-choice"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm my responsibility as the initial Campus administrator.</label><p>Additional permissions can be managed inside Campus. No duplicate BrightWay account is created.</p></>}
        </fieldset><p role="status">{busy ? "Saving securely…" : saved || "Use Continue or Save and exit to preserve your progress."}</p><footer>{draft.step > 1 && <button type="button" disabled={busy} onClick={() => save(draft.step - 1)}>Back</button>}<button type="button" disabled={busy} onClick={() => save(draft.step, true)}>Save and exit</button><button className="bw-campus-primary" disabled={busy || (draft.step === 3 && !draft.enabledEngines.length) || (draft.step === 4 && !confirmed)}>{draft.step === 4 ? "Activate and open Campus" : "Continue"}</button></footer>
      </form></div></>}
  </main>;
}

import CampusBilling from "../billing/CampusBilling";
import TvetWorkspace from "../tvet/TvetWorkspace";
import GradeSchoolWorkspace from "../grade-school/GradeSchoolWorkspace";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import { campusApi } from "../../api/campus";
import "./campus.css";

const label = { GRADE_SCHOOL: "Grade School", TVET: "Technical and Vocational Education (TVET)" };
const statusText = { NOT_CONFIGURED: "Not configured", SETUP: "Setup", ACTIVE: "Active", PAUSED: "Paused", BLOCKED: "Eligibility blocked" };
const emptyAnnouncement = { title: "", body: "", audience: "STAFF" };
const safeError = error => error?.message || "The Campus request failed. Retry after reloading.";

function Status({ campus, eligible }) {
  const state = campus?.status || "NOT_CONFIGURED";
  return <span className={"bw-campus-status bw-campus-status-" + state.toLowerCase()}>
    <span aria-hidden="true" />{statusText[state] || state}{!eligible && state !== "BLOCKED" ? " · Not eligible" : ""}
  </span>;
}

export default function CampusSetupOverview({ organization }) {
  const id = organization.id;
  const [data, setData] = useState(null), [schoolView, setSchoolView] = useState(true);
  const [form, setForm] = useState({ engine: organization.type === "SCHOOL" ? "GRADE_SCHOOL" : "TVET", displayName: organization.name, contactEmail: "" });
  const [draft, setDraft] = useState(emptyAnnouncement);
  const [announcements, setAnnouncements] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const key = useRef(null), inFlight = useRef(false);
  const load = useCallback(async (signal, preserveForm = false) => {
    const snapshot = await campusApi.read(id, signal);
    if (signal?.aborted) return;
    setData(snapshot);
    if (!preserveForm) setForm({
      engine: snapshot.campus?.engine || (organization.type === "SCHOOL" ? "GRADE_SCHOOL" : "TVET"),
      displayName: snapshot.campus?.displayName || organization.name,
      contactEmail: snapshot.campus?.contactEmail || "",
    });
    const canRead = snapshot.campus?.status === "ACTIVE" && (snapshot.permissions.length > 0 || snapshot.canAnnounce);
    if (canRead) {
      const feed = await campusApi.announcements(id, signal);
      if (signal?.aborted) return;
      setAnnouncements(feed.items); setNextCursor(feed.nextCursor);
    } else { setAnnouncements([]); setNextCursor(null); }
    return snapshot;
  }, [id, organization.name, organization.type]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => { if (!controller.signal.aborted) return load(controller.signal); })
      .catch(e => { if (!controller.signal.aborted) setError(safeError(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load]);

  async function run(work, message) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await work();
      await load();
      setNotice(message);
    } catch (e) { setError(safeError(e)); }
    finally { setBusy(false); inFlight.current = false; }
  }
  function save(event) {
    event.preventDefault();
    if (!data || !form.displayName.trim()) return;
    const payload = { engine: form.engine, displayName: form.displayName.trim(), contactEmail: form.contactEmail.trim() || null,
      expectedVersion: data.campus?.version || 0 };
    if (!data.campus || data.campus.storedStatus === "SETUP") {
      void run(() => campusApi.setup(id, payload), "Campus configuration saved. Activate explicitly when ready.");
    } else {
      void run(() => campusApi.settings(id, { displayName: payload.displayName, contactEmail: payload.contactEmail, expectedVersion: payload.expectedVersion }),
        "Campus settings updated.");
    }
  }
  function publish(event) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.body.trim()) return;
    if (!key.current) key.current = crypto.randomUUID();
    const submitted = { title: draft.title.trim(), body: draft.body.trim(), audience: draft.audience, requestKey: key.current };
    void run(async () => { await campusApi.publish(id, submitted); key.current = null; setDraft(emptyAnnouncement); },
      "Announcement published for the selected Campus audience.");
  }
  async function loadMore() {
    if (!nextCursor || moreBusy) return;
    setMoreBusy(true); setError("");
    try {
      const page = await campusApi.announcements(id, undefined, nextCursor);
      setAnnouncements(previous => [...previous, ...page.items.filter(item => !previous.some(p => p.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (e) { setError(safeError(e)); }
    finally { setMoreBusy(false); }
  }
  if (loading && !data) return <section className="bw-campus-root" role="status">Checking current Campus availability…</section>;
  if (!data) return <section className="bw-campus-root"><p role="alert">{error || "Virtual Campus is unavailable."}</p><button type="button" onClick={() => { setLoading(true); load().catch(e => setError(safeError(e))).finally(() => setLoading(false)); }}>Retry</button></section>;

  const campus = data.campus, state = campus?.status || "NOT_CONFIGURED";
  const canConfigure = data.canSetup && (!campus || campus.storedStatus === "SETUP");
  const canEditSettings = campus && data.canManage && (data.eligible || data.canSetup);
  const active = state === "ACTIVE";
  const canRead = active && (data.permissions.length > 0 || data.canAnnounce);
  const mayPublish = active && data.canAnnounce;
  return <section className="bw-campus-root" aria-labelledby="campus-heading">
    <header className="bw-campus-hero">
      <div><p className="bw-campus-kicker">BRIGHTWAY / DIGITAL CAMPUS</p><h2 id="campus-heading">Virtual Campus</h2>
        <p>Organize school and training operations in one secure workspace. Campus is separate from global Programs and Admissions.</p>
        <div className="bw-campus-tags"><Status campus={campus} eligible={data.eligible} />
          {campus?.engine && <span className="bw-campus-engine">{label[campus.engine]}</span>}</div></div>
      <div className="bw-campus-hero-mark" aria-hidden="true"><WorkspaceIcon name="learning" size={38} /></div>
    </header>
    {error && <p className="bw-campus-message" role="alert">{error}</p>}
    {notice && <p className="bw-campus-message bw-campus-success" role="status">{notice}</p>}
    {campus?.status === "ACTIVE" && data.permissions.some(p => ["organization.campus.academics.manage", "organization.campus.teach"].includes(p)) && <><nav className="bw-school-mode-tabs" aria-label="Campus tools"><button type="button" aria-pressed={schoolView} onClick={() => setSchoolView(true)}>{campus.engine === "TVET" ? "TVET management" : "School management"}</button><button type="button" aria-pressed={!schoolView} onClick={() => setSchoolView(false)}>Campus settings & announcements</button></nav>{schoolView && (campus.engine === "TVET" ? <TvetWorkspace key={id} campusId={id} /> : <GradeSchoolWorkspace key={id} campusId={id} />)}</>}
    {campus?.status === "ACTIVE" && data.permissions.includes("organization.campus.billing.manage") && <details className="bw-campus-panel"><summary>Campus billing & payments</summary><CampusBilling key={id} campusId={id} /></details>}
    <div className="bw-campus-layout" hidden={schoolView && campus?.status === "ACTIVE" && data.permissions.some(p => ["organization.campus.academics.manage", "organization.campus.teach"].includes(p))}>
      <div className="bw-campus-main">
        <section className="bw-campus-panel" aria-labelledby="campus-eligibility">
          <div className="bw-campus-panel-heading"><div><span className="bw-campus-overline">01 / AVAILABILITY</span><h3 id="campus-eligibility">Campus eligibility</h3></div><strong className={data.eligible ? "bw-campus-yes" : "bw-campus-no"}>{data.eligible ? "Eligible" : "Restricted"}</strong></div>
          <ul className="bw-campus-checks">
            <li><span>{data.eligibility.verifiedOrganization ? "✓" : "×"}</span> Verified, approved organization</li>
            <li><span>{data.eligibility.verifiedLiberiaOperation ? "✓" : "×"}</span> Verified operating location in Liberia</li>
            <li><span>{data.eligibility.productEnabled ? "✓" : "×"}</span> Virtual Campus available in Liberia</li>
            <li><span>{data.eligibility.supportedEngines.length ? "✓" : "×"}</span> Approved school or training capability</li>
          </ul>
          {!data.eligible && <div className="bw-campus-guidance"><strong>Campus activation is unavailable.</strong>
            {data.eligibility.reasons.map(reason => <p key={reason}>{reason}</p>)}<p>Other BrightWay organization tools, Programs and Admissions remain available according to existing permissions.</p></div>}
        </section>

        {data.canManage && <section className="bw-campus-panel" aria-labelledby="campus-configuration">
          <div className="bw-campus-panel-heading"><div><span className="bw-campus-overline">02 / ORGANIZATION SETUP</span><h3 id="campus-configuration">{canConfigure ? "Configure your Campus" : "Campus settings"}</h3></div></div>
          <form className="bw-campus-form" onSubmit={save}>
            {canConfigure && <label>Academic engine
              <select value={form.engine} onChange={e => setForm(s => ({ ...s, engine: e.target.value }))} disabled={busy}>
                {data.eligibility.supportedEngines.map(engine => <option key={engine} value={engine}>{label[engine]}</option>)}
              </select>
            </label>}
            {!canConfigure && campus && <p className="bw-campus-fixed">Academic engine: <strong>{label[campus.engine]}</strong>. The engine is locked after activation.</p>}
            <label>Campus display name<input value={form.displayName} maxLength={160} required onChange={e => setForm(s => ({ ...s, displayName: e.target.value }))} disabled={busy || !canEditSettings && !canConfigure} /></label>
            <label>Contact email (optional)<input type="email" maxLength={254} value={form.contactEmail} onChange={e => setForm(s => ({ ...s, contactEmail: e.target.value }))} disabled={busy || !canEditSettings && !canConfigure} /></label>
            {(canConfigure || canEditSettings) && <button type="submit" disabled={busy || !data.eligible}>{busy ? "Saving…" : canConfigure ? "Save Campus setup" : "Save settings"}</button>}
          </form>
          {!campus && <p className="bw-campus-help">Saving configuration creates a Setup record, not an active Campus. No students are registered and no charges are generated.</p>}
          {campus?.storedStatus === "SETUP" && data.canSetup && <div className="bw-campus-transition"><div><strong>Ready to activate?</strong><p>Activation enables scoped Campus permissions and announcements. Grade School academic operations become available to authorized staff.</p></div>
            <button type="button" disabled={busy || !data.eligible} onClick={() => run(() => campusApi.activate(id, campus.version), "Virtual Campus activated.")}>Activate Campus</button></div>}
          {campus?.storedStatus === "ACTIVE" && data.canSetup && <div className="bw-campus-transition"><div><strong>Pause Campus</strong><p>Immediately disables academic, billing and announcement privileges until resumed.</p></div>
            <button type="button" className="bw-campus-muted-button" disabled={busy} onClick={() => { if (window.confirm("Pause Virtual Campus access for all organization staff?")) void run(() => campusApi.pause(id, campus.version), "Campus paused. Staff permissions are no longer effective."); }}>Pause</button></div>}
          {campus?.storedStatus === "PAUSED" && data.canSetup && <div className="bw-campus-transition"><div><strong>Campus paused</strong><p>Verify location and product availability again before resuming.</p></div>
            <button type="button" disabled={busy || !data.eligible} onClick={() => run(() => campusApi.resume(id, campus.version), "Campus resumed.")}>Resume Campus</button></div>}
          {state === "BLOCKED" && <p className="bw-campus-help">Your Campus remains blocked even though its stored status was Active. Restore verified eligibility before resuming Campus operations.</p>}
        </section>}

        {canRead && <section className="bw-campus-panel" aria-labelledby="campus-announcements">
          <div className="bw-campus-panel-heading"><div><span className="bw-campus-overline">03 / COMMUNICATION</span><h3 id="campus-announcements">Campus announcements</h3></div><span>{announcements.length} shown</span></div>
          {mayPublish && <form className="bw-campus-announcement-form" onSubmit={publish}>
            <label>Announcement audience<select aria-label="Announcement audience" value={draft.audience} disabled={busy} onChange={e => { key.current = null; setDraft(s => ({ ...s, audience: e.target.value })); }}><option value="STAFF">Campus staff only</option><option value="CAMPUS">Campus staff and active learners</option></select></label>
            <label>Announcement title<input value={draft.title} maxLength={160} required onChange={e => { key.current = null; setDraft(s => ({ ...s, title: e.target.value })); }} disabled={busy} placeholder="e.g. Academic operations update" /></label>
            <label>Announcement details<textarea value={draft.body} maxLength={3000} required onChange={e => { key.current = null; setDraft(s => ({ ...s, body: e.target.value })); }} disabled={busy} placeholder="Share important information with your Campus team…" rows={4} /></label>
            <button type="submit" disabled={busy || !draft.title.trim() || !draft.body.trim()}>{busy ? "Publishing…" : "Publish announcement"}</button>
          </form>}
          {announcements.length === 0 && <p className="bw-campus-empty">No active announcements have been published yet.</p>}
          <div className="bw-campus-announcements">{announcements.map(item => <article key={item.id} className="bw-campus-announcement">
            <div><h4>{item.title}</h4><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time></div>
            <small>{item.audience === "CAMPUS" ? "Campus staff and active learners" : "Campus staff only"}</small><p>{item.body}</p>{mayPublish && <button type="button" className="bw-campus-link-button" disabled={busy}
              onClick={() => { if (window.confirm("Withdraw this Campus announcement?")) void run(() => campusApi.withdraw(id, item.id, item.version), "Announcement withdrawn."); }}>Withdraw</button>}
          </article>)}</div>
          {nextCursor && <button type="button" className="bw-campus-muted-button" onClick={loadMore} disabled={moreBusy}>{moreBusy ? "Loading…" : "Load more announcements"}</button>}
        </section>}
      </div>
      <aside className="bw-campus-side">
        <section className="bw-campus-panel"><span className="bw-campus-overline">CAMPUS OPERATIONS</span><h3>Shared services</h3>
          <ul className="bw-campus-features"><li>Verified institution and location</li><li>Permission-based staff access</li><li>Settings and announcements</li><li>Immutable activity audit</li><li>Academic and billing access gates</li></ul>
          {data.canSetup && <Link className="bw-campus-staff-link" to={"/organization-workspace/" + id + "/staff"}>Manage staff permissions</Link>}
        </section>
        <section className="bw-campus-panel"><span className="bw-campus-overline">ACADEMIC ENGINES</span><h3>{campus?.engine ? label[campus.engine] : "Choose an engine"}</h3>
          <p>{campus?.engine === "GRADE_SCHOOL" ? "Manage academic years, classes, students, teachers, subject attendance and grades in School management." : campus?.engine === "TVET" ? "Manage trades, intakes, learners, instructors, training attendance, competencies and certificates in TVET management." : "Select Grade School or TVET according to your verified organization capability."}</p>
          <p className="bw-campus-caution">Admission acceptance does not register a learner. Billing cannot be charged from this setup screen.</p>
        </section>
        <Link className="bw-campus-back" to={"/organization-workspace/" + id}>Return to dashboard</Link>
      </aside>
    </div>
  </section>;
}

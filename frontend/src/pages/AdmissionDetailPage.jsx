import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { learningApi as api } from "../api/learning";
import { useAuth } from "../auth/useAuth";
import { ADMISSION_STATUSES as APPLICATION_STATUSES, CYCLE_STATUSES, STUDY_MODES, cycleStatus } from "../../../shared/learning.mjs";
import VerificationBadge from "../components/VerificationBadge";
import ApplicationQuestions from "../components/opportunities/ApplicationQuestions";
import ApplicationHistory from "../components/opportunities/ApplicationHistory";
import "../components/opportunities/opportunities.css";
export default function AdmissionDetailPage({ application = false }) {
  const { id } = useParams(), { account } = useAuth();
  return <Detail key={`${account.id}:${id}:${application}`} id={id} applicationRoute={application} />;
}
function Detail({ id, applicationRoute }) {
  const [cycle, setCycle] = useState(null), [app, setApp] = useState(null), [answers, setAnswers] = useState({});
  const [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [consent, setConsent] = useState(false), [withdrawOpen, setWithdrawOpen] = useState(false);
  const current = useRef(null), lock = useRef(false);
  const load = useCallback(async () => {
    current.current?.abort(); const controller = new AbortController(); current.current = controller;
    try {
      let row, application;
      if (applicationRoute) { application = await api.application(id, controller.signal); row = application.cycle; }
      else { const result = await api.detail(id, controller.signal); row = result.cycle; application = result.application ? await api.application(result.application.id, controller.signal) : null; }
      if (!controller.signal.aborted) { setCycle(row); setApp(application); setAnswers(application?.answers || {}); setError(null); setDirty(false); }
    } catch (e) { if (!controller.signal.aborted) { setError(e); if ([401, 404].includes(e.status)) { setCycle(null); setApp(null); setAnswers({}); } } }
  }, [id, applicationRoute]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; current.current?.abort(); }; }, [load]);
  useEffect(() => { if (!dirty) return; const guard = e => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [dirty]);
  async function action(work) {
    if (lock.current) return; lock.current = true; setBusy(true); setNotice(""); setError(null);
    const controller = new AbortController(); current.current = controller;
    try { const result = await work(controller.signal); if (!controller.signal.aborted) { setApp(result); setAnswers(result.answers); setDirty(false); setWithdrawOpen(false); setNotice(result.status === "SUBMITTED" ? "Your application has been submitted. Track updates here or in My applications." : result.status === "WITHDRAWN" ? "Your application has been withdrawn." : "Draft saved."); } }
    catch (e) { if (!controller.signal.aborted) { setError(e); if ([401, 403, 404].includes(e.status)) setNotice(""); if ([401, 404].includes(e.status)) { setCycle(null); setApp(null); setAnswers({}); } } }
    finally { if (!controller.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  const payload = (action, version = app?.version || 0) => ({ action, shareProfile: consent, expectedVersion: version, expectedCycleVersion: cycle.version, answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined)) });
  async function upload(questionId, file) {
    if (file.size > 5 * 1024 * 1024) { setError(new Error("Choose a file up to 5 MiB.")); return; }
    await action(async signal => {
      const saved = await api.save(cycle.id, payload("SAVE"), signal);
      // Persist the new version even if the file transfer fails, so retry uses
      // the committed draft rather than an obsolete version.
      if (!signal.aborted) { setApp(saved); setDirty(false); }
      return api.upload(saved.id, { expectedVersion: saved.version, questionId }, file, signal);
    });
  }
  const open = cycle && cycleStatus(cycle) === "OPEN" && cycle.program.status === "PUBLISHED";
  const editable = open && (!app || app.status === "DRAFT");
  const blocked = busy || [401, 404, 409].includes(error?.status);
  const questions = app?.cycleSnapshot?.questions || cycle?.questions || [];
  return <section className="bw-op-page bw-op-detail" aria-busy={busy}>
    <Link className="bw-op-back" to="/learning?view=applications">← My applications</Link>
    {error && <div className="bw-op-feedback" role="alert"><p>{error.message}</p>{error.status === 403 && <p><Link to="/profile">Complete your profile</Link> · <Link to="/security">Account security</Link></p>}<button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("Reload and discard unsaved answers?")) void load(); }}>Reload saved application</button></div>}
    {notice && <p className="bw-op-success" role="status">{notice}</p>}
    {!cycle && !error && <p role="status">Opening cycle…</p>}
    {cycle && <>
      <header className="bw-op-detail-header"><p className="bw-op-eyebrow">{STUDY_MODES[cycle.program.studyMode]} · {CYCLE_STATUSES[cycleStatus(cycle)]}</p><p>{cycle.program.title}</p><h1>{app?.cycleSnapshot?.title || cycle.title}</h1><p>{cycle.organization.name} <VerificationBadge kind="organization" /></p><div className="bw-op-detail-meta"><span>{cycle.program.location}</span><span>{STUDY_MODES[cycle.program.studyMode]}</span><span>Deadline: {new Date(cycle.deadline).toLocaleString("en-GB")}</span></div></header>
      <div className="bw-op-detail-layout"><div>
        <section className="bw-op-surface"><h2>About this program</h2><p className="bw-op-description">{app?.cycleSnapshot?.description || cycle.program.description}</p></section>
        <section className="bw-op-surface"><div className="bw-op-section-title"><h2>{editable ? "Your application" : "Application details"}</h2>{app && <span className={`bw-op-status bw-op-status-${app.status.toLowerCase()}`}>{APPLICATION_STATUSES[app.status]}</span>}</div>
          {!open && !app && <p>This admission cycle is no longer accepting applications.</p>}
          {!editable && app?.feedback && <div className="bw-op-feedback"><h3>Update from the organization</h3><p>{app.feedback}</p></div>}
          {(editable || app) && <>
            {editable && <p>Save a draft at any time. Required questions are marked with an asterisk.</p>}
            <ApplicationQuestions filesApi={api} questions={questions} answers={answers} files={app?.files} applicationId={app?.id} disabled={blocked} readOnly={!editable} onChange={(key, value) => { setAnswers(old => ({ ...old, [key]: value })); setDirty(true); }} onFile={upload} />
            {editable && <><div className="bw-op-consent"><label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={blocked} /><span>Share my answers, attachments, and a snapshot of my name, headline, location, skills, interests, and verified credentials with authorized {cycle.organization.name} staff. My private contact details are excluded.</span></label><p>Your profile must be complete before submission. You can track the decision or withdraw here.</p></div><div className="bw-op-actions"><button className="bw-op-secondary" type="button" disabled={blocked} onClick={() => void action(signal => api.save(cycle.id, payload("SAVE"), signal))}>Save draft</button><button className="bw-op-primary" type="button" disabled={blocked || !consent} onClick={() => void action(signal => api.save(cycle.id, payload("SUBMIT"), signal))}>{busy ? "Saving…" : "Submit application"}</button></div></>}
          </>}
        </section>
        {app && <ApplicationHistory statuses={APPLICATION_STATUSES} events={app.events} />}
      </div><aside className="bw-op-surface bw-op-side"><p>Acceptance is an admission decision. Official registration and enrolment are completed separately with the institution.</p><h2>{app?.status === "SUBMITTED" ? "You’re on your way" : "Your next step"}</h2><p>{app?.status && app.status !== "DRAFT" ? "Check this page for decisions and feedback from the organization." : "Your application stays private between you and authorized organization staff."}</p><Link to="/learning?view=applications">View all my applications →</Link>
        {app && app.status !== "WITHDRAWN" && <div className="bw-op-withdraw">{withdrawOpen ? <><p>Withdraw this application? This cannot be undone.</p><button type="button" disabled={busy} onClick={() => void action(signal => api.withdraw(app.id, app.version, signal))}>Confirm withdrawal</button><button type="button" disabled={busy} onClick={() => setWithdrawOpen(false)}>Keep application</button></> : <button type="button" disabled={busy} onClick={() => setWithdrawOpen(true)}>Withdraw application</button>}</div>}
      </aside></div>
    </>}
  </section>;
}

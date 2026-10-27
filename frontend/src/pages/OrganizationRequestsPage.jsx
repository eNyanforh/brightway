import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { organizationsApi as api } from "../api/organizations";
import { countryCodes } from "./profile-countries";
import { identityDate } from "./manual-identity-format";
import "./organizations.css";
const empty = { name: "", type: "SCHOOL", representativeRole: "", countryCode: "", region: "", city: "", address: "", offersTraining: "" };
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = countryCodes.map(code => ({ code, label: names.of(code) || code })).sort((a, b) => a.label.localeCompare(b.label));
export default function OrganizationRequestsPage() {
  const { account } = useAuth();
  return <OrganizationRequests key={account?.id || "anonymous"} actor={account?.id} />;
}
function OrganizationRequests({ actor }) {
  const [state, setState] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [retrying, setRetrying] = useState(false);
  const life = useRef(null), lock = useRef(false), retry = useRef(null);
  const data = state?.actor === actor ? state.data : null, values = draft?.actor === actor ? draft.values : empty;
  useEffect(() => {
    const current = { actor, controller: new AbortController() }; life.current = current; lock.current = false; retry.current = null;
    async function load() {
      try { const [requests, access] = await Promise.all([api.list(current.controller.signal), api.access(current.controller.signal)]); if (life.current === current) setState({ actor, data: { ...requests, access } }); }
      catch (e) { if (life.current === current && e.name !== "AbortError") setError(e); }
    }
    if (actor) void load();
    return () => { current.controller.abort(); if (life.current === current) life.current = null; };
  }, [actor]);
  const change = (key, value) => setDraft(old => ({ actor, values: { ...(old?.actor === actor ? old.values : empty), [key]: value } }));
  useEffect(() => {
    if (!draft || draft.actor !== actor) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [draft, actor]);
  async function reload() {
    if (lock.current) return; lock.current = true; const current = life.current; setBusy(true);
    try { const requests = await api.list(); if (life.current === current) { setState(old => ({ actor, data: { ...requests, access: old?.data?.access } })); setError(null); } }
    catch (e) { if (life.current === current) { setError(e); if ([401, 403].includes(e.status)) { setState(null); setDraft(null); retry.current = null; setRetrying(false); } } }
    finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  async function submit(event) {
    event.preventDefault(); if (lock.current || !data) return; lock.current = true; const current = life.current; setBusy(true); setError(null); setNotice("");
    const { offersTraining, ...fields } = values;
    const body = retry.current || { ...fields, ...(values.type === "SCHOOL" ? {} : { offersTraining: offersTraining === "yes" }), idempotencyKey: crypto.randomUUID() };
    retry.current = body;
    try {
      const request = await api.submit(body);
      if (life.current !== current) return;
      retry.current = null; setRetrying(false); setDraft(null);
      setState(old => ({ actor, data: { ...old.data, requests: [request, ...old.data.requests.filter(r => r.id !== request.id)] } }));
      setNotice("Organization request submitted. It stays private until BrightWay approves it.");
    } catch (e) {
      if (life.current !== current) return; setError(e);
      if (!e.status || e.status >= 500) setRetrying(true);
      else { retry.current = null; setRetrying(false); }
      if ([401, 403].includes(e.status)) { setState(null); setDraft(null); retry.current = null; setRetrying(false); }
    } finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  return <section className="bw-org-page"><h1>Create an organization</h1>
    <p>Bring your school, NGO or company to BrightWay. An Agent checks your request; a separate BrightWay approver makes the final decision. Our review target is 72 hours.</p>
    <p>No document uploads are required. Your organization name, type, training capability and operating location become public only after approval. Your account email and internal review notes stay private.</p>
    {error && <p role="alert">{error.message}</p>}{notice && <p role="status">{notice}</p>}
    {data?.access && (data.access.agent || data.access.approver) && <p><Link to="/admin/organizations">Organization review workspace</Link></p>}
    {!data && !error && <p role="status">Loading your organization requests…</p>}
    {data && <><form onSubmit={submit}><fieldset disabled={busy || retrying} className="bw-org-fields"><legend>Organization details</legend>
      <label>Organization name<input required minLength={2} maxLength={160} value={values.name} onChange={e => change("name", e.target.value)} /></label>
      <label>Organization type<select value={values.type} onChange={e => change("type", e.target.value)}><option value="SCHOOL">School</option><option value="NGO">NGO</option><option value="COMPANY">Company</option></select></label>
      <label>Your representative role<input required minLength={2} maxLength={120} value={values.representativeRole} onChange={e => change("representativeRole", e.target.value)} /></label>
      <label>Country of operation<select required value={values.countryCode} onChange={e => change("countryCode", e.target.value)}><option value="">Choose a country</option>{countries.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
      <label>{values.countryCode === "LR" ? "County" : "Region / state (optional)"}<input maxLength={120} value={values.region} onChange={e => change("region", e.target.value)} /></label>
      <label>City / locality<input required maxLength={120} value={values.city} onChange={e => change("city", e.target.value)} /></label>
      <label>Operating address<input required maxLength={300} value={values.address} onChange={e => change("address", e.target.value)} /></label>
      {values.type !== "SCHOOL" && <label>Can this organization offer training/education also?<select required value={values.offersTraining} onChange={e => change("offersTraining", e.target.value)}><option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select></label>}
    </fieldset><button type="submit" disabled={busy}>{busy ? "Please wait…" : retrying ? "Retry same organization request" : "Submit organization request"}</button></form>
      <h2>My organization requests</h2><button type="button" disabled={busy} onClick={reload}>Reload organization status</button>
      {!data.requests.length && <p>No organization requests yet.</p>}
      <ul className="bw-org-list">{data.requests.map(r => <li key={r.id}><h3>{r.name}</h3><p>Status: <strong>{r.status}</strong> · Review target: {identityDate(r.targetAt)}{r.overdue && " · Past target; approval is still required"}</p>{r.decisionReason && <p>{r.decisionReason}</p>}{r.organizationId && <p>You are the primary administrator. <Link to={`/organizations/${r.organizationId}`}>View organization</Link></p>}</li>)}</ul>
      {data.nextCursor && <button type="button" disabled={busy} onClick={async () => {
        if (lock.current) return; lock.current = true; setBusy(true); const current = life.current;
        try { const next = await api.list(undefined, data.nextCursor); if (life.current === current) setState(old => ({ actor, data: { ...next, access: old.data.access } })); }
        catch (e) { if (life.current === current) { setError(e); if ([401, 403].includes(e.status)) { setState(null); setDraft(null); } } }
        finally { if (life.current === current) { lock.current = false; setBusy(false); } }
      }}>Older organization requests</button>}
    </>}
  </section>;
}

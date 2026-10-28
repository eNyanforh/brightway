import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { organizationsApi as api } from "../api/organizations";
import WorkTabs from "../components/organizations/WorkTabs";
import { countryCodes } from "./profile-countries";
import "./organizations.css";
const empty = { name: "", type: "SCHOOL", representativeRole: "", countryCode: "", region: "", city: "", address: "", offersTraining: "" };
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = countryCodes.map(code => ({ code, label: names.of(code) || code })).sort((a, b) => a.label.localeCompare(b.label));
const editable = r => ["SUBMITTED", "ASSIGNED", "RECOMMENDED"].includes(r.status);
export default function OrganizationRequestsPage() {
  const { account } = useAuth(), { id } = useParams();
  return <OrganizationRequests key={`${account?.id}:${id || "new"}`} actor={account?.id} id={id} />;
}
function OrganizationRequests({ actor, id }) {
  const outlet = useOutletContext();
  const [state, setState] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState(null), [created, setCreated] = useState(null), [busy, setBusy] = useState(false), [retrying, setRetrying] = useState(false), [stale, setStale] = useState(false);
  const life = useRef(null), lock = useRef(false), retry = useRef(null);
  const values = draft || empty;
  useEffect(() => {
    const current = { controller: new AbortController() }; life.current = current;
    async function load() {
      try {
        const data = id ? await api.owner(id, current.controller.signal) : await api.access(current.controller.signal);
        if (life.current !== current) return;
        setState(data);
        if (id) { setDraft({ ...empty, ...data.location, name: data.name, type: data.type, representativeRole: data.representativeRole, offersTraining: data.offersTraining ? "yes" : "no" }); setStale(!editable(data)); }
      } catch (e) { if (life.current === current && e.name !== "AbortError") setError(e); }
    }
    if (actor) void load();
    return () => { current.controller.abort(); if (life.current === current) life.current = null; };
  }, [actor, id]);
  const change = (key, value) => setDraft(old => ({ ...(old || empty), [key]: value }));
  useEffect(() => {
    if (!draft && !busy) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [draft, busy]);
  async function submit(event) {
    event.preventDefault(); if (lock.current || !state || stale) return;
    lock.current = true; const current = life.current; setBusy(true); setError(null);
    const { offersTraining, ...fields } = values;
    const body = retry.current || { ...fields, ...(values.type === "SCHOOL" ? {} : { offersTraining: offersTraining === "yes" }), ...(id ? { expectedVersion: state.version } : { idempotencyKey: crypto.randomUUID() }) };
    retry.current = body;
    try {
      const request = id ? await api.edit(id, body) : await api.submit(body);
      if (life.current !== current) return;
      retry.current = null; setRetrying(false); setDraft(null); setCreated(request); outlet?.onOrganizationSubmitted?.();
    } catch (e) {
      if (life.current !== current) return; setError(e);
      if (!id && (!e.status || e.status >= 500)) setRetrying(true);
      else { retry.current = null; setRetrying(false); if (id && (!e.status || e.status >= 500 || e.status === 409)) setStale(true); }
      if ([401, 403, 404].includes(e.status)) { setState(null); setDraft(null); retry.current = null; setRetrying(false); }
    } finally { if (life.current === current) { lock.current = false; setBusy(false); } }
  }
  function another() { setCreated(null); setDraft(null); setError(null); }
  return <section className="bw-org-page"><h1>{id ? "Edit organization request" : "Create an organization"}</h1><WorkTabs />
    {error && <p role="alert">{error.message}</p>}
    {created ? <div className="bw-work-confirmation" role="status"><h2>{id ? "Organization request updated" : "Interest submitted"}</h2>
      <p>{id ? `Your changes to “${created.name}” were saved. Review will restart; the original 72-hour review target is unchanged.` : `Your interest to register “${created.name}” is submitted for review in 72 hours.`}</p>
      {!id && <p>This is our review target. Your organization becomes available after approval.</p>}
      <div className="bw-work-actions"><Link className="bw-org-workspace-entry" to={`/work#request-${created.id}`}>View Progress</Link>{id ? <Link to="/organizations/new">Create another organization</Link> : <button type="button" onClick={another}>Create another organization</button>}</div>
    </div> : <>
      <p>Register your interest to bring your school, NGO or company to BrightWay. An Agent checks your request; a separate BrightWay approver makes the final decision. Our review target is 72 hours.</p>
      <p>No document uploads are required. Your organization name, type, training capability and operating location become public only after approval. Your account email and internal review notes stay private.</p>
      {id && <p>Editing restarts review and clears the previous assignment and recommendation. Previous findings remain in the private audit history; the original review target is unchanged.</p>}
      {!state && !error && <p role="status">Loading organization details…</p>}
      {state && <form onSubmit={submit}><fieldset disabled={busy || retrying || stale} className="bw-org-fields"><legend>Organization details</legend>
        <label>Organization name<input required minLength={2} maxLength={160} value={values.name} onChange={e => change("name", e.target.value)} /></label>
        <label>Organization type<select value={values.type} onChange={e => change("type", e.target.value)}><option value="SCHOOL">School</option><option value="NGO">NGO</option><option value="COMPANY">Company</option></select></label>
        <label>Your representative role<input required minLength={2} maxLength={120} value={values.representativeRole} onChange={e => change("representativeRole", e.target.value)} /></label>
        <label>Country of operation<select required value={values.countryCode} onChange={e => change("countryCode", e.target.value)}><option value="">Choose a country</option>{countries.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
        <label>{values.countryCode === "LR" ? "County" : "Region / state (optional)"}<input maxLength={120} value={values.region} onChange={e => change("region", e.target.value)} /></label>
        <label>City / locality<input required maxLength={120} value={values.city} onChange={e => change("city", e.target.value)} /></label>
        <label>Operating address<input required maxLength={300} value={values.address} onChange={e => change("address", e.target.value)} /></label>
        {values.type !== "SCHOOL" && <label>Can this organization offer training/education also?<select required value={values.offersTraining} onChange={e => change("offersTraining", e.target.value)}><option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select></label>}
      </fieldset><div className="bw-work-actions"><button type="submit" disabled={busy || stale}>{busy ? "Please wait…" : id ? "Save organization changes" : retrying ? "Retry same organization request" : "Submit organization request"}</button>{id && <Link to="/work">Back to My Workspace</Link>}</div></form>}
      {stale && <p>Reload this page to review the current request before making more changes. Your entered details have been kept.</p>}
    </>}
  </section>;
}

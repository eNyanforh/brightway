import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { organizationProfileApi as api } from "../../api/organization-profile";
import { staffApi } from "../../api/organization-staff";
import { OrganizationBootstrapContext } from "./organization-bootstrap-context";
import OrganizationProfileEditor from "./OrganizationProfileEditor";
export default function OrganizationSetupGate({ children }) {
  const { id, organizationId } = useParams(), { account } = useAuth();
  return <Gate key={`${account?.id}:${id || organizationId}`} id={id || organizationId}>{children}</Gate>;
}
function Gate({ id, children }) {
  const [bootstrap, setBootstrap] = useState(null);
  const [profile, setProfile] = useState(null), [error, setError] = useState(null), [generation, setGeneration] = useState(0);
  const setActing = useOutletContext()?.setActingOrganization;
  const refresh = useCallback(() => setGeneration(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    staffApi.context(id, controller.signal).then(async context => {
      // One authorized read supplies both setup and workspace access. A missing setup
      // projection is supported during a rolling server upgrade only.
      const next = context.setup || await api.read(id, controller.signal);
      if (!controller.signal.aborted) { setBootstrap(context.setup ? context : null); setProfile(next); setError(null); }
    }).catch(error => { if (!controller.signal.aborted) { setError(error); setProfile(null); setActing?.(null); } });
    return () => controller.abort();
  }, [id, generation, setActing]);
  if (error) return <section className="bw-org-page"><h1>Organization workspace</h1><p role="alert">{error.message}</p><button type="button" onClick={refresh}>Reload organization access</button><p><Link to="/work">Back to My Workspace</Link></p></section>;
  if (!profile) return <p role="status">Checking organization setup…</p>;
  if (!profile.required) return <OrganizationBootstrapContext.Provider value={bootstrap}>{children}</OrganizationBootstrapContext.Provider>;
  if (!profile.canEdit) return <section className="bw-org-page"><h1>Organization setup pending</h1><p>An authorized administrator must finish profile setup for {profile.organization.name} before its workspace opens. Contact details are optional.</p><button type="button" onClick={refresh}>Check setup status</button><p><Link to="/work">Back to My Workspace</Link></p></section>;
  return <OrganizationProfileEditor key={generation} profile={profile} required onSaved={next => { setProfile(next); if (!next.required) refresh(); }} />;
}

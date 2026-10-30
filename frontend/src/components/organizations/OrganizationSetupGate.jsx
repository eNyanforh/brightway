import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { organizationProfileApi as api } from "../../api/organization-profile";
import OrganizationProfileEditor from "./OrganizationProfileEditor";
export default function OrganizationSetupGate({ children }) {
  const { id, organizationId } = useParams(), { account } = useAuth();
  return <Gate key={`${account?.id}:${id || organizationId}`} id={id || organizationId}>{children}</Gate>;
}
function Gate({ id, children }) {
  const [profile, setProfile] = useState(null), [error, setError] = useState(null), [generation, setGeneration] = useState(0);
  const setActing = useOutletContext()?.setActingOrganization;
  const refresh = useCallback(() => setGeneration(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    api.read(id, controller.signal).then(next => { if (!controller.signal.aborted) { setProfile(next); setError(null); } }).catch(error => { if (!controller.signal.aborted) { setError(error); setProfile(null); setActing?.(null); } });
    return () => controller.abort();
  }, [id, generation, setActing]);
  if (error) return <section className="bw-org-page"><h1>Organization workspace</h1><p role="alert">{error.message}</p><button type="button" onClick={refresh}>Reload organization access</button><p><Link to="/work">Back to My Workspace</Link></p></section>;
  if (!profile) return <p role="status">Checking organization setup…</p>;
  if (!profile.required) return children;
  if (!profile.canEdit) return <section className="bw-org-page"><h1>Organization setup pending</h1><p>An authorized administrator must finish profile setup for {profile.organization.name} before its workspace opens. Contact details are optional.</p><button type="button" onClick={refresh}>Check setup status</button><p><Link to="/work">Back to My Workspace</Link></p></section>;
  return <OrganizationProfileEditor key={generation} profile={profile} required onSaved={setProfile} />;
}

import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { staffApi } from "../api/organization-staff";
import { useOrganizationBootstrap } from "../components/organizations/organization-bootstrap-context";
import CampusSetupOverview from "../components/organizations/CampusSetupOverview";
import { CAMPUS_MODULE_BY_SECTION } from "../components/grade-school/campus-modules";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
import "./campus-workspace.css";

const isCampusMember = context => {
  const organization = context?.organization;
  return Boolean(organization && ((context.membership?.role === "PRIMARY_ADMIN" &&
    (organization.type === "SCHOOL" || organization.offersTraining)) ||
    context.permissions?.some(permission => permission.startsWith("organization.campus."))));
};

const validSections = new Set(["overview", "setup", "academics", "announcements", "billing", ...Object.keys(CAMPUS_MODULE_BY_SECTION)]);

export default function CampusWorkspacePage() {
  const { id, section = "overview" } = useParams();
  const { account } = useAuth();
  const bootstrap = useOrganizationBootstrap();
  const { setCampusWorkspace } = useOutletContext() || {};
  const [view, setView] = useState(null);
  const [failure, setFailure] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const onCampusSnapshot = useCallback(snapshot => {
    setCampusWorkspace?.(previous => {
      if (!previous || previous.organization?.id !== id || previous.accountId !== account?.id) return previous;
      const status = snapshot.campus?.status || "NOT_CONFIGURED";
      const engine = snapshot.campus?.engine || null;
      const permissions = [...new Set([
        ...previous.permissions.filter(permission => !permission.startsWith("organization.campus.")),
        ...(snapshot.permissions || []),
      ])];
      if (previous.status === status && previous.engine === engine &&
          previous.permissions.length === permissions.length &&
          previous.permissions.every(permission => permissions.includes(permission))) return previous;
      return { ...previous, status, engine, permissions };
    });
  }, [id, account?.id, setCampusWorkspace]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const context = bootstrap?.accountId === account?.id && bootstrap?.organization?.id === id
          ? bootstrap : await staffApi.context(id, controller.signal);
        if (controller.signal.aborted) return;
        if (!isCampusMember(context)) {
          setView(null);
          setCampusWorkspace?.(null);
          setFailure({ id, error: new Error("Your organization role does not include Virtual Campus access.") });
          return;
        }
        setView({ id, context });
        setFailure(null);
        setCampusWorkspace?.({ accountId: account?.id, organization: context.organization, permissions: context.permissions || [], role: context.membership?.role });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setView(null);
        setCampusWorkspace?.(null);
        setFailure({ id, error: cause });
      }
    }
    void load();
    return () => controller.abort();
  }, [id, account?.id, bootstrap, setCampusWorkspace, revision]);

  if (!id) return <Navigate to="/work" replace />;
  if (!validSections.has(section)) return <Navigate to={`/campus/${id}`} replace />;
  const ready = view?.id === id && view.context.accountId === account?.id ? view.context : null;
  const error = failure?.id === id ? failure.error : null;
  if (error) return <section className="bw-campus-workspace-page bw-campus-access-state"><h1>Virtual Campus</h1><p role="alert">{error.message}</p><button type="button" onClick={refresh}>Retry Campus access</button><p><Link to="/work">Back to My Workspace</Link></p></section>;
  if (!ready) return <p role="status">Checking Virtual Campus access…</p>;

  return <section className="bw-campus-workspace-page" aria-label="Virtual Campus workspace">
    <header className="bw-campus-workspace-heading">
      <div className="bw-campus-workspace-identity">
        <span className="bw-campus-workspace-mark"><WorkspaceIcon name="learning" size={25} /></span>
        <div><p>BRIGHTWAY / VIRTUAL CAMPUS</p><h1>{ready.organization.name}</h1><span>Dedicated institutional learning workspace</span></div>
      </div>
      <div className="bw-campus-workspace-actions">
        <Link to={`/organization-workspace/${id}`}>Organization workspace</Link>
        <Link to="/work">Switch workspace</Link>
      </div>
    </header>
    <CampusSetupOverview key={`${id}:${section}`} organization={ready.organization} section={section} onCampusSnapshot={onCampusSnapshot} />
  </section>;
}

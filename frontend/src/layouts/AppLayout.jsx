import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

import AppHeader from "../components/layout/AppHeader";
import OrganizationNavigation from "../components/layout/OrganizationNavigation";
import ManagementNavigation from "../components/layout/ManagementNavigation";
import AppSidebar from "../components/layout/AppSidebar";
import MobileNavigation from "../components/layout/MobileNavigation";

import { organizationsApi } from "../api/organizations";
import { profileApi } from "../api/profile";
import {
  createProfileDraft,
  formFromProfile,
} from "../pages/profile-form";

import "./app-shell.css";

export default function AppLayout() {
  const { pathname } = useLocation(), { account } = useAuth();
  const [workAccess, setWorkAccess] = useState(null);
  const workGeneration = useRef(0);
  const hasWork = workAccess?.accountId === account?.id && workAccess.hasWork;
  const onOrganizationSubmitted = useCallback(() => { workGeneration.current++; setWorkAccess({ accountId: account?.id, hasWork: true }); }, [account?.id]);
  useEffect(() => {
    let controller;
    const load = () => {
      controller?.abort(); controller = new AbortController(); const signal = controller.signal, generation = workGeneration.current;
      if (!account?.id) return;
      organizationsApi.workAccess(signal).then(result => { if (!signal.aborted && generation === workGeneration.current) setWorkAccess({ accountId: account.id, hasWork: result.hasWork === true }); }).catch(error => { if (!signal.aborted && [401, 403].includes(error.status)) setWorkAccess(null); });
    };
    load(); window.addEventListener("focus", load);
    return () => { controller?.abort(); window.removeEventListener("focus", load); };
  }, [account?.id]);
  const [actingOrganization, setActingOrganization] = useState(null);
  const [managementWorkspace, setManagementWorkspace] = useState(null);
  const managementMode = pathname === "/management";
  const management = managementMode && managementWorkspace?.accountId === account?.id ? managementWorkspace : null;
  const organizationMode = /^\/organization-workspace\/[^/]+(?:\/|$)/.test(pathname);
  const organizationBase = `/organization-workspace/${actingOrganization?.organization.id}`;
  const activeOrganization = actingOrganization?.accountId === account?.id && (pathname === organizationBase || pathname.startsWith(organizationBase + "/")) ? actingOrganization : null;
  const acting = activeOrganization?.organization;
  const [profileDraft, setProfileDraft] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);

  const navigationId = useId();
  const navigationToggleRef = useRef(null);

  useEffect(() => {
    if (!navigationOpen) return;

    const close = (event) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
        navigationToggleRef.current?.focus();
      }
    };

    document.addEventListener("keydown", close);

    return () => {
      document.removeEventListener("keydown", close);
    };
  }, [navigationOpen]);

  useEffect(() => {
    const controller = new AbortController();

    Promise.resolve()
      .then(() =>
        controller.signal.aborted
          ? undefined
          : profileApi.read(controller.signal),
      )
      .then((profile) => {
        if (!controller.signal.aborted) {
          setProfileDraft(createProfileDraft(profile));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setProfileError(error);
        }
      });

    return () => controller.abort();
  }, []);

  const reloadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);

    try {
      const profile = await profileApi.read();
      setProfileDraft(createProfileDraft(profile));
    } catch (error) {
      setProfileError(error);
      throw error;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const dirty =
    profileDraft &&
    JSON.stringify(profileDraft.form) !==
      JSON.stringify(formFromProfile(profileDraft.profile));

  useEffect(() => {
    if (!dirty && !profileDraft?.busy) return;

    const guard = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", guard);

    return () => {
      window.removeEventListener("beforeunload", guard);
    };
  }, [dirty, profileDraft?.busy]);

  return (
    <div className={`bw-app-shell${organizationMode ? " bw-org-shell" : managementMode ? " bw-management-shell" : ""}`}>
      <AppHeader
        hasWork={hasWork}
        actingOrganization={acting}
        workspaceLabel={managementMode ? "BrightWay Management" : undefined}
        photoId={profileDraft?.profile.photo?.id}
        unsaved={dirty}
        profileBusy={profileDraft?.busy}
        navigationOpen={navigationOpen}
        navigationId={navigationId}
        navigationToggleRef={navigationToggleRef}
        onToggleNavigation={() =>
          setNavigationOpen((value) => !value)
        }
      />

      <div className="bw-design-layout">
        {managementMode ? <ManagementNavigation management={management} id={navigationId} open={navigationOpen} onNavigate={() => setNavigationOpen(false)} /> : organizationMode ? <OrganizationNavigation acting={activeOrganization} id={navigationId} open={navigationOpen} onNavigate={() => setNavigationOpen(false)} /> : <AppSidebar
          hasWork={hasWork}
          id={navigationId}
          open={navigationOpen}
          onNavigate={() => setNavigationOpen(false)}
        />}

        <main className="bw-app-content">
          <Outlet
            context={{
              onOrganizationSubmitted,
              setActingOrganization,
              setManagementWorkspace,
              profileDraft,
              setProfileDraft,
              profileError,
              profileLoading,
              reloadProfile,
            }}
          />
        </main>
      </div>

      {managementMode ? <ManagementNavigation management={management} mobile onNavigate={() => setNavigationOpen(false)} /> : organizationMode ? <OrganizationNavigation acting={activeOrganization} mobile onNavigate={() => setNavigationOpen(false)} /> : <MobileNavigation
        onNavigate={() => setNavigationOpen(false)}
      />}
    </div>
  );
}

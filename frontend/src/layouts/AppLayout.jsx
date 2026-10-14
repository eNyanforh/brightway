import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "../components/layout/AppSidebar";
import AccountMenu from "../components/layout/AccountMenu";
import { profileApi } from "../api/profile";
import { createProfileDraft, formFromProfile } from "../pages/profile-form";
import "./app-shell.css";

export default function AppLayout() {
  // One shared profile load powers the header picture and the profile page.
  // Drafts stay in memory within this signed-in layout and clear on sign-out.
  const [profileDraft, setProfileDraft] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    // Defer one microtask so StrictMode cleanup can cancel before a request starts.
    Promise.resolve()
      .then(() =>
        controller.signal.aborted
          ? undefined
          : profileApi.read(controller.signal),
      )
      .then((profile) => {
        if (!controller.signal.aborted)
          setProfileDraft(createProfileDraft(profile));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setProfileError(error);
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
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, profileDraft?.busy]);

  return (
    <div className="bw-app-shell">
      <header className="bw-app-header">
        <AppSidebar />
        <AccountMenu
          photoId={profileDraft?.profile.photo?.id}
          unsaved={dirty}
          profileBusy={profileDraft?.busy}
        />
      </header>
      <main className="bw-app-content">
        <Outlet
          context={{
            profileDraft,
            setProfileDraft,
            profileError,
            profileLoading,
            reloadProfile,
          }}
        />
      </main>
    </div>
  );
}
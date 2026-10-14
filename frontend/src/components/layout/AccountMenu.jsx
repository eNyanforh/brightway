import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import ProfilePicture from "../profile/ProfilePicture";

export default function AccountMenu({ photoId, unsaved, profileBusy }) {
  const { account, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = [account.person.firstName, account.person.lastName]
    .filter(Boolean)
    .join(" ");
  async function signOut() {
    if (busy || profileBusy) return;
    if (
      unsaved &&
      !window.confirm("Sign out and discard your unsaved profile edits?")
    )
      return;
    setError("");
    setBusy(true);
    try {
      await logout();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bw-account-controls">
      <span className="bw-account-username">@{account.username}</span>
      <NavLink
        className="bw-account-picture"
        to="/profile"
        aria-label="Open your profile"
      >
        <ProfilePicture key={photoId} id={photoId} name={name} decorative />
      </NavLink>
      <button
        className="bw-app-logout"
        type="button"
        disabled={busy || profileBusy}
        onClick={signOut}
      >
        {busy ? "Logging out…" : "Log out"}
      </button>
      {error && (
        <p className="bw-account-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
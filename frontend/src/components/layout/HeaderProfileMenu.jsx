import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";

import { useAuth } from "../../auth/useAuth";
import ProfilePicture from "../profile/ProfilePicture";
import { AccountContextFacepile, AccountContextPrimary, AccountContextChoices } from "./AccountContexts";
import { useAccountContexts } from "./useAccountContexts";

export default function HeaderProfileMenu({
  photoId,
  hasWork,
  unsaved,
  profileBusy,
  actingOrganization,
}) {
  const { account, logout } = useAuth();
  const { contexts, loading: contextsLoading, error: contextsError, refresh: refreshContexts } = useAccountContexts(account?.id);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const wrapper = useRef(null);
  const trigger = useRef(null);
  const firstAction = useRef(null);
  const mutation = useRef(false);

  const panelId = useId();

  const name = [
    account.person.firstName,
    account.person.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  // The header's primary identity follows the authorized workspace/Campus route.
  // A route parameter alone cannot establish organization or student access.
  const orgId = /^\\/organization-workspace\\/([^/]+)(?:\\/|$)/.exec(pathname)?.[1];
  const params = new URLSearchParams(search);
  const campusView = pathname === "/learning" && params.get("view") === "campus";
  const campusId = campusView ? params.get("campus") : null;
  const orgContext = orgId && contexts.find(context => context.type === "organization" && context.id === orgId);
  const verifiedOrganization = orgId && actingOrganization?.id === orgId
    ? { key: `org:${orgId}`, id: orgId, type: "organization", name: actingOrganization.name,
        photoId: actingOrganization.photoId || actingOrganization.profilePhotoId || null }
    : null;
  const campusContext = campusView && (campusId
    ? contexts.find(context => context.type === "school" && context.id === campusId)
    : contexts.find(context => context.type === "school"));
  const activeContext = orgId ? orgContext || verifiedOrganization : campusContext || null;

  useEffect(() => {
    if (!open) return;

    firstAction.current?.focus();

    const outside = (event) => {
      if (!wrapper.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };

    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function signOut() {
    if (profileBusy || mutation.current) return;

    if (
      unsaved &&
      !window.confirm(
        "Sign out and discard your unsaved profile edits?",
      )
    ) {
      return;
    }

    mutation.current = true;
    setBusy(true);
    setError("");

    try {
      await logout();
      setOpen(false);
    } catch (failure) {
      setError(
        failure.message || "Unable to log out. Please try again.",
      );
      setOpen(true);
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  return (
    <Wrapper
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <Trigger
        ref={trigger}
        type="button"
        aria-label="Open account menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { if (!open) refreshContexts(); setOpen((value) => !value); }}
      >
        <AccountContextFacepile
          contexts={contexts}
          activeContext={activeContext}
          personalPhotoId={photoId}
          personalName={name}
        />
        {activeContext
          ? <AccountContextPrimary context={activeContext} />
          : <ProfilePicture key={photoId || "personal"} id={photoId} name={name} decorative />}
      </Trigger>

      {open && (
        <Panel id={panelId} aria-label="Account menu">
          <Identity>
            <strong>{name}</strong>
            <span>@{account.username}</span>
          </Identity>

          <AccountContextChoices
            contexts={contexts}
            activeContext={activeContext}
            loading={contextsLoading}
            error={contextsError}
            onSelect={destination => { setOpen(false); navigate(destination); }}
          />

          <Action
            ref={firstAction}
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/profile");
            }}
          >
            View profile
          </Action>

          {hasWork && <Action type="button" disabled={busy || profileBusy} onClick={() => { setOpen(false); navigate("/work"); }}>My Workspace</Action>}


          <Action type="button" disabled={busy || profileBusy} onClick={() => { setOpen(false); navigate("/security"); }}>Account security</Action>
          <Action type="button" disabled={busy || profileBusy} onClick={() => { setOpen(false); navigate("/help"); }}>Help & support</Action>
          <Action type="button" disabled={busy || profileBusy} onClick={() => { setOpen(false); navigate("/help/reports"); }}>My reports</Action>

          <Action
            type="button"
            disabled={busy || profileBusy}
            onClick={signOut}
          >
            {busy ? "Logging out…" : "Log out"}
          </Action>

          {!hasWork && <MobileOrganization aria-label="Grow your organization">
            <span className="organization-eyebrow">
              GROW TOGETHER
            </span>

            <h3>Make room for your organization.</h3>

            <p>
              Bring your school, company, or community to BrightWay.
            </p>

            <button
              type="button"
              disabled={busy || profileBusy}
              onClick={() => { setOpen(false); navigate("/organizations/new"); }}
            >
              <span className="organization-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>

              <span>Create an organization</span>
            </button>
          </MobileOrganization>}

          {error && (
            <ErrorMessage role="alert">{error}</ErrorMessage>
          )}
        </Panel>
      )}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const Trigger = styled.button`
  /* Every visible identity is the same size; primary is the rightmost avatar. */
  --bw-header-avatar-size: 43px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 8px;
  min-height: var(--bw-header-avatar-size);
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;

  &:hover .bw-picture,
  &:hover .bw-context-main-avatar {
    box-shadow: 0 0 0 3px #175cd3;
  }

  .bw-picture {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--bw-header-avatar-size);
    height: var(--bw-header-avatar-size);
    border-radius: 50%;
    overflow: hidden;
    background: #fff;
    color: #000;
    transition: box-shadow 0.2s;
  }

  .bw-picture img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  @media (max-width: 700px) {
    --bw-header-avatar-size: 33px;
    gap: 6px;
    .bw-picture { font-size: 11px; }
  }
`;

const Panel = styled.div`
  position: absolute;
  right: 0;
  top: calc(100% + 20px);
  z-index: 110;

  width: min(310px, calc(100vw - 24px));
  max-height: calc(100dvh - 110px);
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;

  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  color: #000;

  @media (max-width: 700px) {
    width: min(280px, calc(100vw - 24px));
    max-height: calc(
      100dvh - 150px - env(safe-area-inset-bottom, 0px)
    );
  }
`;

const Identity = styled.div`
  padding: 10px 12px 14px;
  margin-bottom: 5px;
  border-bottom: 1px solid #e5e7eb;

  strong,
  span {
    display: block;
    overflow-wrap: anywhere;
  }

  strong {
    font-size: 13px;
  }

  span {
    margin-top: 3px;
    font-size: 11px;
    color: #000;
  }
`;

const Action = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 11px 12px;
  min-height: 44px;

  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #000;
  font-size: 13px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: #edf4ff;
    color: #175cd3;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const MobileOrganization = styled.section`
  display: none;

  @media (max-width: 700px) {
    display: block;
    padding: 16px 12px 10px;
    margin-top: 8px;
    border-top: 1px solid #e5eaf1;

    .organization-eyebrow {
      color: #000;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.15px;
    }

    h3 {
      margin: 9px 0;
      color: #000;
      font-size: 15px;
      line-height: 1.45;
    }

    p {
      margin: 0 0 14px;
      color: #000;
      font-size: 12px;
      line-height: 1.6;
    }

    button {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 44px;
      padding: 13px 12px;

      border: 1px solid #185ac3;
      border-radius: 12px;
      background: linear-gradient(115deg, #175cd3, #3479e7);
      color: #fff;

      font: inherit;
      font-size: 12px;
      font-weight: 650;
      line-height: 1.4;
      text-align: left;

      box-shadow: 0 5px 12px #175cd31a;
    }

    button:disabled {
      opacity: 1;
      cursor: not-allowed;
    }

    .organization-icon {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 29px;
      height: 29px;
      border-radius: 8px;
      background: #ffffff24;
    }
  }
`;

const ErrorMessage = styled.p`
  padding: 10px 12px;
  font-size: 12px;
  color: #b42318;
  overflow-wrap: anywhere;
`;

import ProfilePhotoReviewStatus from "../components/profile/ProfilePhotoReviewStatus";
import { profilePhotoReviewsApi } from "../api/profile-photo-reviews";
import { useIdentityStatus } from "../auth/useIdentityStatus";
import VerificationBadge from "../components/VerificationBadge";
import { hasVerifiedIdentity } from "./manual-identity-format";
import { useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { profileApi } from "../api/profile";
import {
  changesFromForm,
  editorFields,
  formForSection,
  formFromProfile,
  mergeSavedSection,
  validateForm,
} from "./profile-form";
import Icon from "../components/layout/Icon";
import ProfilePicture from "../components/profile/ProfilePicture";
import ProfileContact from "../components/profile/ProfileContact";
import ProfileCompletion from "../components/profile/ProfileCompletion";
import ProfileHistory from "../components/profile/ProfileHistory";
import ProfileActivities from "../components/profile/ProfileActivities";
import ProfileEditor from "../components/profile/ProfileEditor";
import "./profile.css";

const regionNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function featuredRecord(history, field) {
  const records = Array.isArray(history?.records) ? history.records : [];
  const valid = records.filter((record) => typeof record?.[field] === "string" && record[field].trim());
  return valid.find((record) => record.current === true) || valid[0] || null;
}

function ProfileAffiliation({ icon, label, name, description }) {
  return (
    <div className="bw-profile-affiliation">
      <span className="bw-profile-affiliation-icon"><Icon name={icon} /></span>
      <span className="bw-profile-affiliation-copy">
        <small>{label}</small>
        <strong>{name}</strong>
        {description && <span>{description}</span>}
      </span>
    </div>
  );
}

function Section({
  title,
  id,
  editor,
  action = "Edit",
  children,
  onEdit,
  busy,
}) {
  return (
    <section id={id} className="bw-profile-card bw-profile-section">
      <div className="bw-profile-section-head">
        <h2>{title}</h2>

        <button
          className="bw-profile-edit"
          disabled={busy}
          onClick={() => onEdit(editor)}
          data-profile-editor={editor}
          aria-label={`Edit ${title.toLowerCase()}`}
        >
          <Icon name={action === "Edit" ? "pencil" : "plus"} />
          <span>{action}</span>
        </button>
      </div>

      {children}
    </section>
  );
}

function Labels({ entries, empty, neutral = false }) {
  return entries.length ? (
    <div
      className={`bw-profile-tags ${
        neutral ? "bw-profile-tags-neutral" : ""
      }`}
    >
      {entries.map((entry) => (
        <span className="bw-profile-tag" key={entry}>
          {entry}
        </span>
      ))}
    </div>
  ) : (
    <p className="bw-profile-muted">{empty}</p>
  );
}

export default function ProfilePage() {
  const { account, refresh } = useAuth();

  const {
    profileDraft: draft,
    setProfileDraft: setDraft,
    profileError,
    profileLoading,
    reloadProfile,
  } = useOutletContext();

  const [file, setFile] = useState(null);
  const [pictureAttempt, setPictureAttempt] = useState(0);
  const mutation = useRef(false);

  const profile = draft?.profile;
  const busy = draft?.busy || profileLoading;
  const privacySettingsDisabled = busy || [401, 409].includes(draft?.error?.status);
  const { identityStatus, identityError, refreshIdentityStatus } = useIdentityStatus(profile?.version);
  const identityVerified = hasVerifiedIdentity(identityStatus);
  const photoReviewRequired = profile?.photoReview?.required === true || identityVerified;

  const name = [
    account.person.firstName,
    account.person.middleName,
    account.person.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  const dirty =
    profile &&
    JSON.stringify(draft.form) !==
      JSON.stringify(formFromProfile(profile));

  async function refreshChecklist(expectedVersion = profile.version) {
    const completion = await profileApi.completion();

    if (completion.profileVersion !== expectedVersion) {
      throw new Error(
        "Your saved profile changed. Reload the saved profile after keeping any unsaved edits you need.",
      );
    }

    setDraft((previous) => {
      if (
        !previous ||
        completion.profileVersion !== previous.profile.version
      ) {
        return previous;
      }

      return {
        ...previous,
        profile: {
          ...previous.profile,
          completion,
        },
      };
    });
  }

  async function emailVerified(result) {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            profile: {
              ...previous.profile,
              completion: null,
              contact: {
                ...previous.profile.contact,
                emailVerifiedAt: result.emailVerifiedAt,
              },
            },
            notice:
              "Email verified. Your unsaved profile edits are still here.",
          }
        : previous,
    );

    try {
      await refreshChecklist();
    } catch {
      /* The checklist's Refresh button remains available. */
    }

    void refresh();
  }

  function emailBusy(value) {
    setDraft((previous) =>
      previous ? { ...previous, busy: value } : previous,
    );
  }

  async function reload() {
    if (
      busy ||
      (dirty &&
        !window.confirm(
          "Discard all unsaved profile edits and load the latest saved profile?",
        ))
    ) {
      return;
    }

    try {
      await reloadProfile();
      setFile(null);
    } catch (error) {
      if (profile) {
        setDraft((previous) => ({
          ...previous,
          error,
        }));
      }
    }
  }

  function savedText(value) {
    return JSON.stringify({ form: formFromProfile(value), education: value.education, experience: value.experience, contact: value.contact });
  }

  async function refreshPhotoReview() {
    if (busy || mutation.current) return;
    mutation.current = true;
    setDraft((previous) => ({ ...previous, busy: true, error: null, notice: "" }));
    try {
      const next = await profileApi.readFresh();
      if (next.id !== profile.id || savedText(next) !== savedText(profile)) {
        throw Object.assign(new Error("Other saved profile information changed. Keep your drafts and explicitly reload the profile before continuing."), { status: 409 });
      }
      setDraft((previous) => previous.profile.version === profile.version
        ? { ...previous, profile: next, notice: "Photo review status refreshed. Your unsaved edits are still here." }
        : { ...previous, error: Object.assign(new Error("Your profile changed during refresh. Reload before continuing."), { status: 409 }) });
    } catch (error) { setDraft((previous) => ({ ...previous, error })); }
    finally { mutation.current = false; setDraft((previous) => ({ ...previous, busy: false })); }
  }

  async function cancelPhotoReview() {
    const pending = profile.photoReview?.pending;
    if (!pending || busy || mutation.current) return;
    mutation.current = true;
    setDraft((previous) => ({ ...previous, busy: true, error: null, notice: "" }));
    try {
      const result = await profilePhotoReviewsApi.cancel(pending.id, { expectedVersion: pending.version, expectedProfileVersion: profile.version });
      setDraft((previous) => ({ ...previous, profile: { ...previous.profile, version: result.profileVersion, photoReview: result.photoReview, completion: null }, notice: "Photo request cancelled. Your approved photo is unchanged." }));
      void refreshChecklist(result.profileVersion).catch(() => {});
    } catch (error) { setDraft((previous) => ({ ...previous, error })); }
    finally { mutation.current = false; setDraft((previous) => ({ ...previous, busy: false })); }
  }

  function open(editor) {
    if (busy) return;

    setDraft((previous) => ({
      ...previous,
      editor,
      lastEditor: editor === "photo" ? previous.lastEditor : editor,
      notice: "",
      error: [409, 401].includes(previous.error?.status)
        ? previous.error
        : null,
    }));
  }

  function close() {
    if (!busy) {
      setDraft((previous) => ({
        ...previous,
        editor: null,
      }));
    }
  }

  function cancel() {
    if (busy) return;

    if (draft.editor === "photo") {
      setFile(null);
    }

    setDraft((previous) => {
      const form = { ...previous.form };
      const saved = formFromProfile(previous.profile);

      for (const field of editorFields[previous.editor] || []) {
        form[field] = saved[field];
      }

      return {
        ...previous,
        form,
        editor: null,
        error: [409, 401].includes(previous.error?.status)
          ? previous.error
          : null,
      };
    });
  }

  function change(field, value) {
    setDraft((previous) => ({
      ...previous,
      form: {
        ...previous.form,
        [field]: value,
      },
      notice: "",
    }));
  }

  function choosePhoto(event) {
    const image = event.target.files?.[0];

    setFile(null);

    if (!image) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(image.type) ||
      !image.size ||
      image.size > 5 * 1024 * 1024
    ) {
      event.target.value = "";

      setDraft((previous) => ({
        ...previous,
        error: new Error(
          "Choose a JPEG, PNG or WebP picture, up to 5 MiB.",
        ),
      }));

      return;
    }

    setFile(image);

    setDraft((previous) => ({
      ...previous,
      error: [409, 401].includes(previous.error?.status)
        ? previous.error
        : null,
    }));
  }

  async function save(event) {
    event.preventDefault();

    if (
      busy ||
      mutation.current ||
      [409, 401].includes(draft.error?.status)
    ) {
      return;
    }

    const section = draft.editor;

    const sectionForm =
      section === "photo" ? null : formForSection(draft, section);

    const problem = sectionForm
      ? validateForm(sectionForm, section)
      : !file
        ? "Choose a picture first."
        : "";

    if (problem) {
      setDraft((previous) => ({
        ...previous,
        error: new Error(problem),
      }));

      return;
    }

    const changes = sectionForm
      ? changesFromForm(sectionForm, profile)
      : null;

    if (changes && !Object.keys(changes).length) {
      setDraft((previous) =>
        mergeSavedSection(previous, previous.profile, section),
      );

      return;
    }

    mutation.current = true;

    setDraft((previous) => ({
      ...previous,
      busy: true,
      error: null,
      notice: "",
    }));

    try {
      if (section === "photo") {
        const result = await profileApi.uploadPhoto(
          file,
          profile.version,
        );

        setDraft((previous) => ({
          ...previous,
          profile: {
            ...previous.profile,
            photo: {
              id: result.photoAssetId,
            },
            completion: null,
            version: result.profileVersion ?? previous.profile.version + 1,
            photoReview: result.photoReview ?? previous.profile.photoReview,
          },
          editor: null,
          error: null,
          notice: result.reviewRequired === true
            ? "Replacement photo submitted for review. Your approved photo stays visible."
            : "Profile picture updated.",
        }));

        setFile(null);
        setPictureAttempt((value) => value + 1);

        void refreshChecklist(result.profileVersion ?? profile.version + 1).catch(() => {});
      } else {
        const next = await profileApi.save(
          profile.version,
          changes,
        );

        setDraft((previous) =>
          mergeSavedSection(previous, next, section),
        );
      }
    } catch (error) {
      setDraft((previous) => ({
        ...previous,
        error,
      }));
    } finally {
      mutation.current = false;

      setDraft((previous) => ({
        ...previous,
        busy: false,
      }));
    }
  }

  async function saveProfileViewSetting(field, value) {
    if (privacySettingsDisabled || mutation.current) return;
    mutation.current = true;
    setDraft((previous) => ({ ...previous, busy: true, error: null, notice: "" }));
    try {
      const next = await profileApi.save(profile.version, { [field]: value });
      setDraft((previous) => ({
        ...previous,
        profile: next,
        notice: "Privacy setting saved.",
      }));
    } catch (error) {
      setDraft((previous) => ({ ...previous, error }));
    } finally {
      mutation.current = false;
      setDraft((previous) => ({ ...previous, busy: false }));
    }
  }

  if (!profile) {
    return (
      <section className="bw-profile-loading">
        <h1>My profile</h1>

        {profileError ? (
          <>
            <p role="alert">{profileError.message}</p>

            <button
              className="bw-profile-button"
              disabled={profileLoading}
              onClick={
                profileError.status === 401 ? refresh : reload
              }
            >
              {profileError.status === 401
                ? "Sign in again"
                : "Try again"}
            </button>
          </>
        ) : (
          <p role="status">Loading your profile…</p>
        )}
      </section>
    );
  }

  const location = [
    profile.location?.locality,
    profile.location?.region,
    profile.location?.countryCode
      ? regionNames?.of(profile.location.countryCode) ||
        profile.location.countryCode
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const exploring = profile.careerField?.mode === "EXPLORING";
  const featuredWork = featuredRecord(profile.experience, "organization");
  const featuredEducation = featuredRecord(profile.education, "institution");

  return (
    <div className="bw-profile-page">
      {draft.notice && (
        <p className="bw-profile-success" role="status">
          {draft.notice}
        </p>
      )}

      {dirty && !draft.editor && (
        <div className="bw-profile-draft-banner">
          <span>You have unsaved profile edits.</span>

          <button
            className="bw-profile-button bw-profile-button-secondary"
            onClick={() => open(draft.lastEditor)}
          >
            Resume editing
          </button>

          <button
            className="bw-profile-text-button"
            onClick={() => {
              if (window.confirm("Discard all unsaved profile edits?")) {
                setDraft((previous) => ({
                  ...previous,
                  form: formFromProfile(previous.profile),
                }));
              }
            }}
          >
            Discard all edits
          </button>
        </div>
      )}

      {draft.error && !draft.editor && (
        <div className="bw-profile-error" role="alert">
          <p>{draft.error.message}</p>

          {draft.error.status === 409 && (
            <p>
              Copy any unsaved text you want to keep before loading
              the latest profile.
            </p>
          )}

          <button
            className="bw-profile-button bw-profile-button-secondary"
            disabled={busy}
            onClick={draft.error.status === 401 ? refresh : reload}
          >
            {draft.error.status === 401
              ? "Sign in again"
              : "Reload saved profile"}
          </button>
        </div>
      )}

      <div className="bw-profile-grid">
        <div className="bw-profile-main">
          <section className="bw-profile-card bw-profile-hero" aria-labelledby="profile-person-name">
            <div className="bw-profile-cover">
              <div className="bw-profile-cover-brand">
                <span>BRIGHTWAY / MEMBER PROFILE</span>
              </div>
              <span className="bw-profile-cover-motif" aria-hidden="true" />
            </div>

            <div className="bw-profile-identity">
              <div className="bw-profile-person-top">
                <button
                  className="bw-profile-photo-button"
                  disabled={busy}
                  onClick={() => open("photo")}
                  data-profile-editor="photo"
                  aria-label="Change profile picture"
                >
                  <ProfilePicture
                    key={`${profile.photo?.id}-${pictureAttempt}`}
                    id={profile.photo?.id}
                    name={name}
                  />

                  <span className="bw-profile-camera">
                    <Icon name="camera" />
                  </span>
                </button>

                <button
                  className="bw-profile-button"
                  disabled={busy}
                  data-profile-editor="intro"
                  onClick={() => open("intro")}
                >
                  <Icon name="pencil" />
                  Edit introduction
                </button>
              </div>

              <div className="bw-profile-intro-grid">
                <div className="bw-profile-intro-primary">
                  <h1 id="profile-person-name" className="bw-profile-verified-name">
                    <span>{name}</span>
                    {identityVerified && <VerificationBadge />}
                  </h1>
                  <p className="bw-profile-headline">
                    {profile.headline || "Add a headline that sounds like you."}
                  </p>
                  <p className="bw-profile-location">
                    <Icon name="location" />
                    {location || "Location not added yet"}
                  </p>
                  <p className="bw-profile-handle">@{account.username}</p>
                  {profile.careerField && (
                    <span className="bw-profile-direction-tag">
                      <Icon name="sprout" />
                      {exploring ? "Exploring my path" : profile.careerField.label}
                    </span>
                  )}
                </div>
                {(featuredWork || featuredEducation) && (
                  <div className="bw-profile-affiliations" aria-label="Current work and education">
                    {featuredWork && (
                      <ProfileAffiliation
                        icon="briefcase"
                        label={featuredWork.current ? "Current experience" : "Experience"}
                        name={featuredWork.organization}
                        description={featuredWork.role}
                      />
                    )}
                    {featuredEducation && (
                      <ProfileAffiliation
                        icon="book"
                        label={featuredEducation.current ? "Current education" : "Education"}
                        name={featuredEducation.institution}
                        description={featuredEducation.qualification}
                      />
                    )}
                  </div>
                )}
              </div>
              <div className="bw-profile-identity-status" aria-label="Profile status">
                <span className={identityVerified ? "bw-profile-status bw-profile-status--verified" : "bw-profile-status"}>
                  {identityVerified ? "Identity verified" : "Identity not verified"}
                </span>
                <span className={profile.profilePublicEnabled ? "bw-profile-status bw-profile-status--public" : "bw-profile-status"}>
                  {profile.profilePublicEnabled ? "Public profile published" : "Public profile private"}
                </span>
              </div>
              <div className="bw-profile-intro-actions">
                <button
                  className="bw-profile-button"
                  disabled={busy}
                  onClick={() => open("career")}
                  data-profile-editor="career"
                >
                  <Icon name="sprout" />
                  Edit career direction
                </button>
                {profile.profilePublicEnabled === true && (
                  <Link className="bw-profile-button bw-profile-button-secondary" to={`/people/${encodeURIComponent(account.username)}`}>
                    View public profile
                  </Link>
                )}
                <a className="bw-profile-button bw-profile-button-secondary" href="#profile-activity">
                  See activity
                </a>
              </div>
            </div>
          </section>

          <nav className="bw-profile-section-nav" aria-label="Profile sections">
            <a href="#profile-about">About</a>
            <a href="#profile-activity">Activities</a>
            <a href="#profile-experience">Experience</a>
            <a href="#profile-education">Education</a>
            <a href="#profile-skills">Skills</a>
            <a href="#profile-interests">Interests</a>
            <a href="#profile-direction">Career direction</a>
            <a href="#profile-contact">Contact</a>
            <a href="#profile-privacy">Privacy</a>
          </nav>

          <ProfilePhotoReviewStatus review={{ ...profile.photoReview, required: photoReviewRequired }} name={name} busy={busy} onRefresh={refreshPhotoReview} onCancel={cancelPhotoReview} />

          <Section
            id="profile-about"
            title="About"
            editor="about"
            onEdit={open}
            busy={busy}
          >
            <p className="bw-profile-description">
              {profile.bio ||
                "Your story starts here. Share what matters to you and what you enjoy doing."}
            </p>
          </Section>

          <ProfileActivities key={account.id} accountId={account.id} />

          {["experience", "education"].map((kind) => (
            <div key={kind} id={`profile-${kind}`} className="bw-profile-anchor-section">
              <ProfileHistory
                kind={kind}
                draft={draft}
                setDraft={setDraft}
                onEdit={open}
                onReload={reload}
                busy={busy}
              />
            </div>
          ))}

          <Section
            id="profile-skills"
            title="Skills"
            editor="skills"
            action="Edit skills"
            onEdit={open}
            busy={busy}
          >
            <Labels
              entries={profile.skills}
              empty="What are you good at? Add the skills you are learning or already use."
            />
          </Section>

          <Section
            id="profile-interests"
            title="Interests"
            editor="interests"
            action="Edit interests"
            onEdit={open}
            busy={busy}
          >
            <Labels
              entries={profile.interests}
              empty="Add the topics and activities that spark your curiosity."
              neutral
            />
          </Section>

          <Section
            id="profile-direction"
            title="My direction"
            editor="career"
            onEdit={open}
            busy={busy}
          >
            <div className="bw-profile-career">
              <span className="bw-profile-career-icon">
                <Icon name="sprout" />
              </span>

              <div>
                <h3>
                  {exploring
                    ? "Open to discovering what’s next"
                    : profile.careerField?.label ||
                      "You don’t need to have it all figured out."}
                </h3>

                <p className="bw-profile-description">
                  {profile.careerGoals ||
                    "Add something you would like to learn, achieve, or contribute."}
                </p>
              </div>
            </div>
          </Section>

          <div id="profile-contact" className="bw-profile-anchor-section">
            <ProfileContact
              contact={profile.contact}
              email={account.email}
              busy={busy}
              onEdit={open}
            />
          </div>

        </div>

        <aside className="bw-profile-side">
          <ProfileCompletion
            identityStatus={identityStatus}
            identityError={identityError}
            onIdentityRefresh={refreshIdentityStatus}
            onIdentityReload={reload}
            profile={profile}
            busy={busy}
            dirty={dirty}
            onEdit={open}
            onRefresh={refreshChecklist}
            onBusy={emailBusy}
            onVerified={emailVerified}
          />

          <section id="profile-privacy" className="bw-profile-card bw-profile-side-block bw-profile-view-privacy" aria-labelledby="profile-view-privacy-title">
            <p className="bw-profile-eyebrow">VISIBILITY & PRIVACY</p>
            <h2 id="profile-view-privacy-title">Control your profile</h2>
            <p>Choose what others can see. Your contact information has separate privacy settings.</p>
            <div className="bw-profile-privacy-options">
              <label>
                <input type="checkbox" checked={profile.profilePublicEnabled === true} disabled={privacySettingsDisabled} onChange={(event) => void saveProfileViewSetting("profilePublicEnabled", event.target.checked)} />
                <span>Publish my basic profile so signed-in BrightWay members can view it by username</span>
              </label>
              <small>Only your name, headline, about text, location, career direction and goals, skills, and interests are published. Education, experience, and contact details stay private.</small>
              <label>
                <input type="checkbox" checked={profile.profileViewSharingEnabled === true} disabled={privacySettingsDisabled} onChange={(event) => void saveProfileViewSetting("profileViewSharingEnabled", event.target.checked)} />
                <span>Share my name when I choose to view another person’s profile</span>
              </label>
              <label>
                <input type="checkbox" checked={profile.profileViewNotificationsEnabled === true} disabled={privacySettingsDisabled} onChange={(event) => void saveProfileViewSetting("profileViewNotificationsEnabled", event.target.checked)} />
                <span>Let me know when someone who shares their visit views my profile</span>
              </label>
            </div>
            <small>Profile view alerts require both people to opt in. Repeat views from the same person are combined daily. Turning sharing off stops future notifications but does not erase notifications already sent. All options default to off.</small>
          </section>

          <nav className="bw-profile-card bw-profile-side-block bw-profile-account-tools"
            aria-label="Profile tools">
            <p className="bw-profile-eyebrow">ACCOUNT TOOLS</p>
            <Link to="/credentials"><Icon name="book" /> My credential reviews</Link>
            <Link to="/security"><Icon name="lock" /> Account security</Link>
          </nav>

          <p className="bw-profile-private-note">
            <Icon name="lock" />

            <span>
              Your draft is private. Editing it doesn’t verify your
              identity.
            </span>
          </p>

          <button
            className="bw-profile-text-button"
            disabled={busy}
            onClick={reload}
          >
            Reload saved profile
          </button>
        </aside>
      </div>

      {draft.editor &&
        !["education", "experience"].includes(draft.editor) && (
          <ProfileEditor
            key={draft.editor}
            draft={draft}
            name={name}
            file={file}
            onChange={change}
            onPhoto={choosePhoto}
            onSave={save}
            onClose={close}
            onCancel={cancel}
            onReload={reload}
            onSignIn={refresh}
            photoReviewRequired={photoReviewRequired}
          />
        )}
    </div>
  );
}

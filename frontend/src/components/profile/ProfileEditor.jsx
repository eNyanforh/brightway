import { ContactFields } from "./ProfileContact";
import { useEffect, useRef } from "react";
import InterestPicker from "./InterestPicker";
import Icon from "../layout/Icon";
import ProfilePicture from "./ProfilePicture";
import { countryCodes } from "../../pages/profile-countries";

const names =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
const countries = countryCodes
  .map((code) => ({ code, name: names?.of(code) || code }))
  .sort((a, b) => a.name.localeCompare(b.name));
const titles = {
  contact: "Contact and privacy",
  intro: "Edit introduction",
  about: "A little about you",
  career: "Where do you want to go?",
  skills: "Your skills",
  interests: "Your interests",
  photo: "Change profile picture",
};

function Field({ name, label, value, onChange, maxLength, multiline, hint }) {
  const Control = multiline ? "textarea" : "input";
  return (
    <div className="bw-profile-field">
      <label htmlFor={`profile-${name}`}>{label}</label>
      <Control
        id={`profile-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        rows={multiline ? 5 : undefined}
        aria-describedby={hint ? `profile-hint-${name}` : undefined}
      />
      {hint && <small id={`profile-hint-${name}`}>{hint}</small>}
    </div>
  );
}

export default function ProfileEditor({
  draft,
  name,
  file,
  onChange,
  onPhoto,
  onSave,
  onClose,
  onCancel,
  onReload,
  onSignIn,
}) {
  const dialog = useRef(null);
  const { editor, form, profile, busy, error } = draft;
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const fallback = element
      .closest(".bw-profile-page")
      ?.querySelector(`[data-profile-editor="${editor}"]`);
    element.showModal();
    return () => {
      if (element.open) element.close();
      if (previousFocus?.isConnected) previousFocus.focus();
      else if (fallback?.isConnected) fallback.focus();
    };
  }, [editor]);
  const change = (field, value) => onChange(field, value);
  const eventChange = (event) => change(event.target.name, event.target.value);
  return (
    <dialog
      ref={dialog}
      className="bw-profile-dialog"
      aria-labelledby="profile-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={onSave}>
        <header className="bw-profile-dialog-head">
          <h2 id="profile-dialog-title">{titles[editor]}</h2>
          <button
            type="button"
            className="bw-profile-icon-button"
            disabled={busy}
            aria-label="Close editor and keep edits"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="bw-profile-dialog-body">
          {error && (
            <div className="bw-profile-error" role="alert">
              <p>{error.message}</p>
              {error.status === 409 && (
                <>
                  <p>
                    Your edits are still here. Copy anything you want to keep
                    before loading the latest saved profile.
                  </p>
                  <button
                    type="button"
                    className="bw-profile-button bw-profile-button-secondary"
                    disabled={busy}
                    onClick={onReload}
                  >
                    Discard edits and load latest
                  </button>
                </>
              )}
              {error.status === 401 && (
                <>
                  <p>
                    Your session ended. Copy your edits before signing in again.
                  </p>
                  <button
                    type="button"
                    className="bw-profile-button"
                    onClick={onSignIn}
                  >
                    Sign in again
                  </button>
                </>
              )}
              {error.errors?.length > 0 && (
                <ul>
                  {error.errors.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <fieldset disabled={busy}>
            {editor === "contact" && (
              <ContactFields form={form} email={profile.contact?.email} onChange={change} />
            )}
            {editor === "intro" && (
              <>
                <Field
                  label="Headline"
                  name="headline"
                  value={form.headline}
                  onChange={eventChange}
                  maxLength={120}
                  hint="A clear sentence about who you are today."
                />
                <div className="bw-profile-field">
                  <label htmlFor="profile-countryCode">
                    Country or territory
                  </label>
                  <select
                    id="profile-countryCode"
                    name="countryCode"
                    value={form.countryCode}
                    onChange={eventChange}
                  >
                    <option value="">Not added yet</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bw-profile-field-row">
                  <Field
                    label="Region or county"
                    name="region"
                    value={form.region}
                    onChange={eventChange}
                    maxLength={100}
                  />
                  <Field
                    label="City or locality"
                    name="locality"
                    value={form.locality}
                    onChange={eventChange}
                    maxLength={100}
                  />
                </div>
              </>
            )}
            {editor === "about" && (
              <Field
                label="About you"
                name="bio"
                value={form.bio}
                onChange={eventChange}
                maxLength={2000}
                multiline
                hint="Share what you enjoy, what matters to you, or what you are building."
              />
            )}
            {editor === "career" && (
              <>
                <div className="bw-profile-field">
                  <label htmlFor="profile-careerMode">Career direction</label>
                  <select
                    id="profile-careerMode"
                    name="careerMode"
                    value={form.careerMode}
                    onChange={eventChange}
                  >
                    <option value="">Not added yet</option>
                    <option value="EXPLORING">I am exploring</option>
                    <option value="SPECIFIED">I have a field in mind</option>
                  </select>
                </div>
                {form.careerMode === "SPECIFIED" && (
                  <Field
                    label="Career field"
                    name="careerLabel"
                    value={form.careerLabel}
                    onChange={eventChange}
                    maxLength={100}
                  />
                )}
                <Field
                  label="Career goals"
                  name="careerGoals"
                  value={form.careerGoals}
                  onChange={eventChange}
                  maxLength={1000}
                  multiline
                  hint="What would you like to learn, achieve, or contribute?"
                />
              </>
            )}
            {editor === "skills" && (
              <Field
                label="Skills"
                name="skills"
                value={form.skills}
                onChange={eventChange}
                multiline
                hint="One skill per line. Up to 20 entries, 80 characters each."
              />
            )}
            {editor === "interests" && (
              <InterestPicker value={form.interests} disabled={busy}
                onChange={(value) => change("interests", value)} />
            )}
            {editor === "photo" && (
              <>
                <div className="bw-profile-photo-preview">
                  <ProfilePicture
                    key={profile.photo?.id}
                    id={profile.photo?.id}
                    name={name}
                  />
                </div>
                <div className="bw-profile-field">
                  <label htmlFor="profile-photo">Choose profile picture</label>
                  <input
                    id="profile-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onPhoto}
                  />
                  <small>
                    JPEG, PNG or WebP · up to 5 MiB · at least 128 × 128 pixels.
                  </small>
                </div>
                {file && (
                  <p className="bw-profile-selected-file">
                    Selected: {file.name}
                  </p>
                )}
                <p className="bw-profile-muted">
                  A successful upload becomes your current picture immediately.
                </p>
              </>
            )}
          </fieldset>
        </div>
        <footer className="bw-profile-dialog-foot">
          <button
            type="button"
            className="bw-profile-button bw-profile-button-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bw-profile-button"
            disabled={
              busy ||
              error?.status === 409 ||
              error?.status === 401 ||
              (editor === "photo" && !file)
            }
          >
            {busy
              ? editor === "photo"
                ? "Uploading…"
                : "Saving…"
              : editor === "photo"
                ? "Upload picture"
                : "Save changes"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
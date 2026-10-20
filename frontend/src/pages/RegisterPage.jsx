import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import AuthForm from "../components/auth/AuthForm";
import PasswordField from "../components/auth/PasswordField";
import SignupEmailVerification from "../components/auth/SignupEmailVerification";
import { countryCodes } from "./profile-countries";

const initial = { email: "", firstName: "", middleName: "", lastName: "", username: "", gender: "", birthDate: "", countryCode: "", password: "", confirmPassword: "" };
const steps = ["email", "verification", "personal", "country", "password", "photo"];
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = countryCodes.map((code) => ({ code, label: regionNames.of(code) || code }))
  .sort((a, b) => a.label.localeCompare(b.label));
const personalInputs = [
  { name: "firstName", label: "First name", autoComplete: "given-name", maxLength: 100 },
  { name: "middleName", label: "Middle name (optional)", autoComplete: "additional-name", maxLength: 100, optional: true },
  { name: "lastName", label: "Last name", autoComplete: "family-name", maxLength: 100 },
  { name: "username", label: "Username", autoComplete: "username", minLength: 3, maxLength: 30, pattern: "[A-Za-z0-9_]+", hint: "3–30 letters, numbers, or underscores." },
];
const headings = {
  email: ["Create your BrightWay account", "Start with your email. We’ll send you a verification code."],
  personal: ["Tell us about yourself", "Add your name, username, gender and date of birth."],
  country: ["Choose your country", "Select the country where you currently live."],
  password: ["Create your password", "Choose a secure passphrase for your account."],
  photo: ["Add your profile photo", "One last step before creating your BrightWay account."],
};

export default function RegisterPage() {
  const [fields, setFields] = useState(initial);
  const [step, setStep] = useState("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState(null);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [retryAt, setRetryAt] = useState(0);
  const uploadedPhoto = useRef(null);
  const draftExpiry = useRef(null);
  const locked = useRef(false);
  const verifiedEmail = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const email = fields.email.trim().toLowerCase();

  function change(event) {
    const { name, value } = event.target;
    setFields((previous) => ({ ...previous, [name]: value }));
  }
  function go(next) {
    if (locked.current) return;
    setError(""); setStep(next);
  }
  function report(failure) {
    if (failure.status === 401) {
      uploadedPhoto.current = null; verifiedEmail.current = null;
      setStep("email"); setCode(""); setExpiresAt(null);
    }
    setError(failure.errors?.map((issue) => issue.message).join(" ") || failure.message);
  }
  async function run(action) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await action(); } catch (failure) { report(failure); }
    finally { locked.current = false; setBusy(false); }
  }
  async function sendCode() {
    // The existing cookie draft is reused, preserving its email proof and photo ownership.
    const draft = await authApi.beginSignup();
    if (draftExpiry.current !== draft.expiresAt) uploadedPhoto.current = null;
    draftExpiry.current = draft.expiresAt;
    verifiedEmail.current = null; setCode(""); setExpiresAt(null);
    setStep("verification"); setRetryAt(Date.now() + 60000);
    const result = await authApi.requestSignupEmail(email);
    setExpiresAt(result.expiresAt);
    setRetryAt(Date.now() + (result.retryAfterSeconds ?? 60) * 1000);
  }
  function resend() {
    if (Date.now() < retryAt) return;
    return run(sendCode);
  }
  function verify(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError("Enter the six-digit code from your email."); return; }
    return run(async () => {
      await authApi.verifySignupEmail(email, code);
      verifiedEmail.current = email;
      setCode(""); setStep("personal");
    });
  }
  function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    setError("");
    if (step === "email") {
      if (verifiedEmail.current === email) { setStep("personal"); return; }
      return run(sendCode);
    }
    if (step === "personal") {
      const date = new Date(`${fields.birthDate}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fields.birthDate || fields.birthDate < "0001-01-01" || fields.birthDate > new Date().toISOString().slice(0, 10)) {
        setError("Enter a valid date of birth that is not in the future."); return;
      }
      if (!["FEMALE", "MALE", "OTHER", "PREFER_NOT_TO_SAY"].includes(fields.gender)) {
        setError("Choose a gender option."); return;
      }
      setStep("country"); return;
    }
    if (step === "country") {
      if (!countryCodes.includes(fields.countryCode)) { setError("Choose your country."); return; }
      setStep("password"); return;
    }
    if (step === "password") {
      if (fields.password !== fields.confirmPassword) { setError("Your passwords do not match."); return; }
      setStep("photo"); return;
    }
    if (!photo) { setError("Choose a professional profile photo before creating your account."); return; }
    return run(async () => {
      if (verifiedEmail.current !== email) {
        setStep("email"); setError("Verify your email before creating your account."); return;
      }
      if (!uploadedPhoto.current || uploadedPhoto.current.file !== photo) {
        const uploaded = await authApi.uploadSignupPhoto(photo);
        uploadedPhoto.current = { file: photo, id: uploaded.photoAssetId };
      }
      const body = {
        email, firstName: fields.firstName.trim(), lastName: fields.lastName.trim(),
        username: fields.username.trim().toLowerCase(), password: fields.password,
        photoAssetId: uploadedPhoto.current.id,
        gender: fields.gender, birthDate: fields.birthDate, countryCode: fields.countryCode,
      };
      if (fields.middleName.trim()) body.middleName = fields.middleName.trim();
      try { await authApi.register(body); }
      catch (failure) {
        if (failure.status === 403) {
          verifiedEmail.current = null; setCode(""); setExpiresAt(null);
          setStep("verification");
        }
        // A rejected/expired asset must be uploaded again on the next final submission.
        if (failure.status === 400) uploadedPhoto.current = null;
        throw failure;
      }
      navigate("/login", { replace: true, state: { registered: true, identifier: email, from: location.state?.from } });
    });
  }

  if (step === "verification") return (
    <SignupEmailVerification email={email} code={code} setCode={setCode}
      busy={busy} error={error} expiresAt={expiresAt} retryAt={retryAt}
      onSubmit={verify} onResend={resend} onBack={() => go("email")} />
  );

  return (
    <AuthForm variant="register" registrationStep={steps.indexOf(step)}
      title={headings[step][0]} description={headings[step][1]}
      onSubmit={submit} busy={busy} error={error}
      footer={<>Already have an account? <Link to="/login" state={{ from: location.state?.from }}>Log in</Link></>}>
      {step === "email" && <div className="auth-field">
        <label htmlFor="register-email">Email</label>
        <input id="register-email" name="email" type="email" autoComplete="email" maxLength={254}
          required value={fields.email} onChange={change} />
      </div>}
      {step === "personal" && <>
        <p className="auth-step-note">Email verified: {email}</p>
        {personalInputs.map((field) => <div className={`auth-field auth-field-${field.name}`} key={field.name}>
          <label htmlFor={`register-${field.name}`}>{field.label}</label>
          <input id={`register-${field.name}`} name={field.name} type="text" required={!field.optional}
            autoComplete={field.autoComplete} minLength={field.minLength} maxLength={field.maxLength}
            pattern={field.pattern} value={fields[field.name]} onChange={change}
            aria-describedby={field.hint ? `hint-${field.name}` : undefined} />
          {field.hint && <small id={`hint-${field.name}`}>{field.hint}</small>}
        </div>)}
        <div className="auth-field">
          <label htmlFor="register-gender">Gender</label>
          <select id="register-gender" name="gender" required value={fields.gender} onChange={change}>
            <option value="">Choose an option</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
            <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
          </select>
        </div>
        <div className="auth-field">
          <label htmlFor="register-birthDate">Date of birth</label>
          <input id="register-birthDate" name="birthDate" type="date" autoComplete="bday"
            required min="0001-01-01" max={new Date().toISOString().slice(0, 10)} value={fields.birthDate} onChange={change} />
        </div>
      </>}
      {step === "country" && <div className="auth-field">
        <label htmlFor="register-country">Country of residence</label>
        <select id="register-country" name="countryCode" autoComplete="country" required value={fields.countryCode} onChange={change}>
          <option value="">Choose your country</option>
          {countries.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>}
      {step === "password" && <>
        <PasswordField id="register-password" name="password" label="Password" value={fields.password}
          onChange={change} autoComplete="new-password" minLength={15} maxLength={128}
          hint="Use a passphrase of 15–128 characters." disabled={busy} />
        <PasswordField id="register-confirmPassword" name="confirmPassword" label="Confirm password"
          value={fields.confirmPassword} onChange={change} autoComplete="new-password"
          minLength={15} maxLength={128} disabled={busy} />
      </>}
      {step === "photo" && <div className="auth-field auth-field-photo">
        <label htmlFor="register-photo">Professional profile photo</label>
        <input id="register-photo" type="file" required={!photo} accept="image/jpeg,image/png,image/webp"
          aria-describedby="photo-hint" onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (!chosen) { setPhoto(null); return; }
            if (!["image/jpeg", "image/png", "image/webp"].includes(chosen.type) || chosen.size > 5 * 1024 * 1024) {
              setPhoto(null); event.target.value = "";
              setError("Choose a JPEG, PNG or WebP photo up to 5 MiB."); return;
            }
            setPhoto(chosen); setError("");
          }} />
        {photo && <small>Selected photo: {photo.name}</small>}
        <small id="photo-hint">Required: a clear photo of you, at least 128 × 128 pixels, up to 5 MiB. Your uploaded photo becomes your profile picture when your account is created.</small>
      </div>}
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? step === "email" ? "Sending code…" : "Creating account…" : step === "email" ? "Continue to verification" : step === "photo" ? "Create account" : "Continue"}
      </button>
      {step !== "email" && <button type="button" className="signup-email-secondary" disabled={busy}
        onClick={() => go(step === "personal" ? "email" : steps[steps.indexOf(step) - 1])}>Back</button>}
    </AuthForm>
  );
}
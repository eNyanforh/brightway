import { useRef, useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { authApi } from "../api/auth";
import AuthForm from "../components/auth/AuthForm";
import SignupEmailVerification from "../components/auth/SignupEmailVerification";

const initial = {
  firstName: "",
  middleName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState(null);
  const uploadedPhoto = useRef(null);
  const [step, setStep] = useState("details");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [retryAt, setRetryAt] = useState(0);
  const [pending, setPending] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  function change(event) {
    const { name, value } = event.target;

    setFields((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function submit(event) {
    event.preventDefault();

    if (busy) return;

    setError("");

    if (fields.password !== fields.confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }
    if (!photo) {
      setError("Choose a professional profile photo before creating your account.");
      return;
    }

    setBusy(true);

    try {
      const draft = await authApi.beginSignup();
      if (!uploadedPhoto.current || uploadedPhoto.current.file !== photo ||
        uploadedPhoto.current.expiresAt !== draft.expiresAt) {
        const uploaded = await authApi.uploadSignupPhoto(photo);
        uploadedPhoto.current = { file: photo, id: uploaded.photoAssetId, expiresAt: draft.expiresAt };
      }
      const body = {
        photoAssetId: uploadedPhoto.current.id,
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        username: fields.username.trim().toLowerCase(),
        email: fields.email.trim().toLowerCase(),
        password: fields.password,
      };

      if (fields.middleName.trim()) {
        body.middleName = fields.middleName.trim();
      }

      setPending(body);
      setVerified(false);
      setCode("");
      setStep("verification");
      setRetryAt(Date.now() + 60000);
      const result = await authApi.requestSignupEmail(body.email);
      setExpiresAt(result.expiresAt);
      setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
    } catch (failure) {
      if ([400, 401].includes(failure.status)) uploadedPhoto.current = null;
      if (failure.status === 401) setStep("details");
      const details = failure.errors?.map((issue) => issue.message).join(" ");
      setError(details || failure.message);
    } finally { setBusy(false); }
  }

  async function resend() {
    if (busy || Date.now() < retryAt) return;
    setBusy(true); setError(""); setCode(""); setVerified(false); setExpiresAt(null);
    setRetryAt(Date.now() + 60000);
    try {
      const result = await authApi.requestSignupEmail(pending.email);
      setExpiresAt(result.expiresAt);
      setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
    } catch (failure) {
      if (failure.status === 401) { uploadedPhoto.current = null; setStep("details"); }
      setError(failure.message);
    } finally { setBusy(false); }
  }

  async function finish(event) {
    event.preventDefault();
    if (busy) return;
    if (!verified && !/^\d{6}$/.test(code)) { setError("Enter the six-digit code from your email."); return; }
    setBusy(true); setError("");
    const body = pending;
    let verificationCompleted = verified;
    try {
      if (!verified) {
        await authApi.verifySignupEmail(body.email, code);
        setVerified(true);
        verificationCompleted = true;
      }
      await authApi.register(body);
      navigate("/login", {
        replace: true,

        state: {
          registered: true,
          identifier: body.email,
          from: location.state?.from,
        },
      });
    } catch (failure) {
      if (failure.status === 401 || (failure.status === 400 && verificationCompleted)) uploadedPhoto.current = null;
      if (failure.status === 401) setStep("details");
      if (failure.status === 403) { setVerified(false); setCode(""); }
      const details = failure.errors
        ?.map((issue) => issue.message)
        .join(" ");

      setError(details || failure.message);
    } finally {
      setBusy(false);
    }
  }

  const inputs = [
    {
      name: "firstName",
      label: "First name",
      autoComplete: "given-name",
      maxLength: 100,
    },
    {
      name: "middleName",
      label: "Middle name (optional)",
      autoComplete: "additional-name",
      maxLength: 100,
      optional: true,
    },
    {
      name: "lastName",
      label: "Last name",
      autoComplete: "family-name",
      maxLength: 100,
    },
    {
      name: "username",
      label: "Username",
      autoComplete: "username",
      minLength: 3,
      maxLength: 30,
      pattern: "[A-Za-z0-9_]+",
      hint: "3–30 letters, numbers, or underscores.",
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      autoComplete: "email",
      maxLength: 254,
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      autoComplete: "new-password",
      minLength: 15,
      maxLength: 128,
      hint: "Use a passphrase of 15–128 characters.",
    },
    {
      name: "confirmPassword",
      label: "Confirm password",
      type: "password",
      autoComplete: "new-password",
      minLength: 15,
      maxLength: 128,
    },
  ];

  if (step === "verification") return (
    <SignupEmailVerification email={pending.email} code={code} setCode={setCode}
      busy={busy} error={error} verified={verified} expiresAt={expiresAt} retryAt={retryAt}
      onSubmit={finish} onResend={resend} onBack={() => {
        setStep("details"); setError(""); setCode(""); setVerified(false); setExpiresAt(null);
      }} />
  );

  return (
    <AuthForm
      title="Create your BrightWay account"
      description="One account for learning, networking, and opportunities."
      onSubmit={submit}
      busy={busy}
      error={error}
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            state={{ from: location.state?.from }}
          >
            Log in
          </Link>
        </>
      }
    >
      {inputs.map((field) => (
        <div className="auth-field" key={field.name}>
          <label htmlFor={`register-${field.name}`}>
            {field.label}
          </label>

          <input
            id={`register-${field.name}`}
            name={field.name}
            type={field.type || "text"}
            disabled={busy}
            required={!field.optional}
            autoComplete={field.autoComplete}
            minLength={field.minLength}
            maxLength={field.maxLength}
            pattern={field.pattern}
            aria-describedby={
              field.hint
                ? `hint-${field.name}`
                : undefined
            }
            value={fields[field.name]}
            onChange={change}
          />

          {field.hint && (
            <small id={`hint-${field.name}`}>
              {field.hint}
            </small>
          )}
        </div>
      ))}

      <div className="auth-field">
        <label htmlFor="register-photo">Professional profile photo</label>
        <input id="register-photo" type="file" required={!photo} disabled={busy}
          accept="image/jpeg,image/png,image/webp" aria-describedby="photo-hint"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (!chosen) { setPhoto(null); return; }
            if (!["image/jpeg", "image/png", "image/webp"].includes(chosen.type) || chosen.size > 5 * 1024 * 1024) {
              setPhoto(null); event.target.value = "";
              setError("Choose a JPEG, PNG or WebP photo up to 5 MiB.");
              return;
            }
            setPhoto(chosen); setError("");
          }} />
        {photo && <small>Selected photo: {photo.name}</small>}
        <small id="photo-hint">Required: a clear photo of you, at least 128 × 128 pixels, up to 5 MiB. Your uploaded photo becomes your profile picture when your account is created.</small>
      </div>

      <button
        className="auth-submit"
        type="submit"
        disabled={busy}
      >
        {busy ? "Preparing verification…" : "Continue to email verification"}
      </button>
    </AuthForm>
  );
}
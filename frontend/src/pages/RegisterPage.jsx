import { useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { authApi } from "../api/auth";
import AuthForm from "../components/auth/AuthForm";

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

    setBusy(true);

    try {
      const body = {
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        username: fields.username.trim().toLowerCase(),
        email: fields.email.trim().toLowerCase(),
        password: fields.password,
      };

      if (fields.middleName.trim()) {
        body.middleName = fields.middleName.trim();
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

      <button
        className="auth-submit"
        type="submit"
        disabled={busy}
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </AuthForm>
  );
}
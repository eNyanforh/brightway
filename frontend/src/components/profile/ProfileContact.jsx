import { useId } from "react";
import Icon from "../layout/Icon";
import { contactVisibilityOptions } from "../../pages/profile-contact-form";
import "./profile-contact.css";

export function ContactFields({ form, email, onChange }) {
  const prefix = useId();
  function visibility(key, label) {
    return (
      <div className="bw-profile-field">
        <label htmlFor={`${prefix}-${key}-visibility`}>
          Who can see your {label}?
        </label>
        <select
          id={`${prefix}-${key}-visibility`}
          value={form[`${key}Visibility`]}
          onChange={(event) => onChange(`${key}Visibility`, event.target.value)}
        >
          {Object.entries(contactVisibilityOptions).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <>
      <div className="bw-profile-field">
        <label htmlFor={`${prefix}-email`}>Email</label>
        <input
          id={`${prefix}-email`}
          type="email"
          value={email || ""}
          readOnly
        />
        <small>This is your sign-in email address.</small>
      </div>
      {visibility("email", "email")}
      <div className="bw-profile-field">
        <label htmlFor={`${prefix}-phone`}>Phone number</label>
        <input
          id={`${prefix}-phone`}
          type="tel"
          autoComplete="tel"
          value={form.phoneNumber}
          maxLength={40}
          aria-describedby={`${prefix}-phone-hint`}
          onChange={(event) => onChange("phoneNumber", event.target.value)}
        />
        <small id={`${prefix}-phone-hint`}>
          Required for profile completion. Use + followed by the country code
          and number.
        </small>
      </div>
      {visibility("phone", "phone number")}
      <div className="bw-profile-field">
        <label htmlFor={`${prefix}-whatsapp`}>WhatsApp number (optional)</label>
        <input
          id={`${prefix}-whatsapp`}
          type="tel"
          value={form.whatsappNumber}
          maxLength={40}
          aria-describedby={`${prefix}-whatsapp-hint`}
          onChange={(event) => onChange("whatsappNumber", event.target.value)}
        />
        <small id={`${prefix}-whatsapp-hint`}>
          Enter this separately, even if it matches your phone number.
        </small>
      </div>
      {visibility("whatsapp", "WhatsApp number")}
      <p className="bw-profile-muted">
        Only accepted connections can see fields set to Connections. You can
        always see your own contact details.
      </p>
    </>
  );
}

export default function ProfileContact({ contact, email, busy, onEdit }) {
  const values = contact || {};
  return (
    <section className="bw-profile-card bw-profile-section">
      <div className="bw-profile-section-head">
        <h2>Contact</h2>
        <button
          type="button"
          className="bw-profile-edit"
          disabled={busy}
          data-profile-editor="contact"
          aria-label="Edit contact"
          onClick={() => onEdit("contact")}
        >
          <Icon name="pencil" />
          <span>Edit</span>
        </button>
      </div>
      <dl className="bw-contact-list">
        {[
          ["email", "Email", values.email || email],
          ["phone", "Phone", values.phoneNumber],
          ["whatsapp", "WhatsApp", values.whatsappNumber],
        ].map(([key, label, value]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              <span>
                {value ||
                  (key === "phone"
                    ? "Add a phone number to complete your profile."
                    : "Not added yet")}
              </span>
              <small>
                {
                  contactVisibilityOptions[
                    values.visibility?.[key] || "ONLY_ME"
                  ]
                }
              </small>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

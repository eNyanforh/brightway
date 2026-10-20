import { useEffect, useId, useRef } from "react";
import Icon from "../layout/Icon";
import "./auth.css";

const stories = {
  login: { eyebrow: "GOOD TO HAVE YOU BACK", title: <>Your story.<br /> Still unfolding.</>, text: "Pick up where you left off. Your skills, your interests and your next chapter are all part of the journey." },
  register: { eyebrow: "A PLACE TO BEGIN", title: <>Be yourself.<br /> Become more.</>, text: "You don’t have to have it all figured out. Start with who you are today, and make room for who you’re becoming." },
  verify: { eyebrow: "ONE SMALL STEP", title: <>A brighter way.<br /> A secure beginning.</>, text: "Verify your email to start creating your account. Your story stays yours, from the very first step." },
};
export default function AuthForm({ title, description, onSubmit, busy, error, children, footer, variant = "login", registrationStep = 0 }) {
  const headingId = useId();
  const heading = useRef(null);
  useEffect(() => {
    if (variant !== "login") heading.current?.focus();
  }, [title, registrationStep, variant]);
  const story = stories[variant] || stories.login;
  return (
    <div className={`bw-auth-layout bw-auth-${variant}`}>
      <aside className="bw-auth-story">
        <p className="bw-public-eyebrow">{story.eyebrow}</p>
        <h2>{story.title}</h2>
        <p className="bw-auth-story-text">{story.text}</p>
        <div className="bw-auth-story-art" aria-hidden="true"><span className="bw-auth-orbit" /><span className="bw-auth-symbol">b<span>↗</span></span><span className="bw-auth-star">✦</span><span className="bw-auth-art-label">YOUR OWN WAY FORWARD</span></div>
        <p className="bw-auth-story-foot"><Icon name="sprout" /> Not just social. Purposeful.</p>
      </aside>
      <section className="auth-card" aria-labelledby={headingId}>
        <p className="auth-eyebrow">{variant === "login" ? "WELCOME BACK" : variant === "verify" ? "CHECK YOUR INBOX" : "LET’S GET STARTED"}</p>
        {variant !== "login" && <ol className="auth-progress" aria-label="Account creation progress">
          {["Email", "Verify", "Personal", "Country", "Password", "Photo"].map((label, index) => (
            <li key={label} aria-current={registrationStep === index ? "step" : undefined}>
              <span>{index < registrationStep ? "✓" : index + 1}</span>{label}
            </li>
          ))}
        </ol>}
        <h1 id={headingId} ref={heading} tabIndex={variant !== "login" ? -1 : undefined}>{title}</h1>
        <p className="auth-description">{description}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form onSubmit={onSubmit} aria-busy={busy}><fieldset disabled={busy}>{children}</fieldset></form>
        {footer && <p className="auth-footer">{footer}</p>}
      </section>
    </div>
  );
}
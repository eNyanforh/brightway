import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { notificationsApi } from "../api/notifications";
import { useAuth } from "../auth/useAuth";
import VerificationBadge from "../components/VerificationBadge";
import Icon from "../components/layout/Icon";
import "./public-person.css";

const regionNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

function locationLabel(location = {}) {
  return [location.locality, location.region,
    location.countryCode ? regionNames?.of(location.countryCode) || location.countryCode : null]
    .filter(Boolean).join(", ");
}

function PersonAvatar() {
  // This endpoint only shares the owner's published text fields. Do not
  // invent a photograph or identity verification when neither is provided.
  return <span className="bw-public-person-avatar" aria-label="Profile avatar" role="img">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c.45-4.3 3-6.4 7.5-6.4s7.05 2.1 7.5 6.4" />
    </svg>
  </span>;
}

function PublishedPerson({ username }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    queueMicrotask(async () => {
      if (signal.aborted) return;
      try {
        const profile = await notificationsApi.viewProfile(username, signal);
        if (!signal.aborted) setResult({ profile });
      } catch (error) {
        if (!signal.aborted) setResult({ error });
      }
    });
    return () => controller.abort();
  }, [username]);

  if (!result) return <section className="bw-public-person bw-public-person-loading">
    <p role="status">Opening profile…</p>
  </section>;

  const { profile, error } = result;
  if (error) return <section className="bw-public-person bw-public-person-loading">
    <Link className="bw-public-person-back" to="/network">Back to Network</Link>
    <h1>Profile unavailable</h1>
    <p role="alert">{error.message}</p>
  </section>;

  const field = profile.careerField?.mode === "EXPLORING"
    ? "Exploring career options" : profile.careerField?.label;
  const location = locationLabel(profile.location);
  const hasDirection = Boolean(field || profile.careerGoals);
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const certifications = Array.isArray(profile.certifications) ? profile.certifications : [];
  const verifiedCredentials = Array.isArray(profile.verifiedCredentials) ? profile.verifiedCredentials : [];
  const achievements = Array.isArray(profile.achievements) ? profile.achievements : [];
  const education = Array.isArray(profile.education) ? profile.education.filter(record => !record.verified) : [];
  const experience = Array.isArray(profile.experience) ? profile.experience.filter(record => !record.verified) : [];

  return <article className="bw-public-person">
    <Link className="bw-public-person-back" to="/network">
      <span aria-hidden="true">←</span> Back to Network
    </Link>
    <div className="bw-public-person-hero">
      <div className="bw-public-person-cover" aria-hidden="true">
        <span>BRIGHTWAY / COMMUNITY</span>
      </div>
      <header className="bw-public-person-identity">
        <PersonAvatar />
        <div className="bw-public-person-intro">
          <span className="bw-public-person-status">Member profile</span>
          <h1 className="bw-public-person-name"><span>{profile.fullName}</span>{profile.identityVerified === true && <VerificationBadge />}</h1>
          <p className="bw-public-person-handle">@{profile.username}</p>
          {profile.headline && <p className="bw-public-person-headline">{profile.headline}</p>}
          {location && <p className="bw-public-person-location">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>{location}
          </p>}
        </div>
      </header>
    </div>

    {(profile.bio || hasDirection || skills.length || interests.length ||
      certifications.length || verifiedCredentials.length || achievements.length || education.length || experience.length) && (
      <nav className="bw-public-person-nav" aria-label="Profile sections">
        {profile.bio && <a href="#published-about">About</a>}
        {experience.length > 0 && <a href="#published-experience">Experience</a>}
        {education.length > 0 && <a href="#published-education">Education</a>}
        {verifiedCredentials.length > 0 && <a href="#published-credentials">Verified credentials</a>}
        {certifications.length > 0 && <a href="#published-certifications">Certifications</a>}
        {achievements.length > 0 && <a href="#published-achievements">Achievements</a>}
        {hasDirection && <a href="#published-direction">Career direction</a>}
        {skills.length > 0 && <a href="#published-skills">Skills</a>}
        {interests.length > 0 && <a href="#published-interests">Interests</a>}
      </nav>
    )}

    <div className="bw-public-person-content">
      {profile.bio && <section id="published-about" aria-labelledby="published-about-title">
        <h2 id="published-about-title">About</h2>
        <p>{profile.bio}</p>
      </section>}
      {experience.length > 0 && <section id="published-experience" aria-labelledby="published-experience-title">
        <h2 id="published-experience-title">Experience</h2>
        <p className="bw-public-person-section-help">Self-reported experience; not independently verified.</p>
        <div className="bw-public-person-records">{experience.map(record => <article key={record.id} className="bw-public-person-record">
          <span className="bw-public-person-record-icon"><Icon name="briefcase" /></span>
          <div><h3>{record.title}</h3><p>{record.organization}</p>
            <small>{record.startMonth} – {record.current ? "Present" : record.endMonth || "Not specified"}</small>
            {record.description && <p>{record.description}</p>}
          </div>
        </article>)}</div>
      </section>}
      {education.length > 0 && <section id="published-education" aria-labelledby="published-education-title">
        <h2 id="published-education-title">Education</h2>
        <p className="bw-public-person-section-help">Self-reported education; not independently verified.</p>
        <div className="bw-public-person-records">{education.map(record => <article key={record.id} className="bw-public-person-record">
          <span className="bw-public-person-record-icon"><Icon name="book" /></span>
          <div><h3>{record.title}</h3><p>{record.organization}</p>
            <small>{record.startMonth} – {record.current ? "Present" : record.endMonth || "Not specified"}</small>
            {record.description && <p>{record.description}</p>}
          </div>
        </article>)}</div>
      </section>}
      {verifiedCredentials.length > 0 && (
        <section id="published-credentials" aria-labelledby="published-credentials-title">
          <h2 id="published-credentials-title">Verified credentials</h2>
          <p className="bw-public-person-section-help">Education and experience records reviewed by an authorized issuer or BrightWay.</p>
          <div className="bw-public-person-records">
            {verifiedCredentials.map(record => (
              <article className="bw-public-person-record" key={record.kind + record.id}>
                <span className="bw-public-person-record-icon"><Icon name={record.kind === "education" ? "book" : "briefcase"} /></span>
                <div>
                  <h3>{record.title}</h3>
                  <p>{record.organization}</p>
                  <small>{record.startMonth} – {record.current ? "Present" : record.endMonth || "Not specified"}</small>
                  <span className="bw-public-person-verified" aria-label="Verified credential">✓ Verified credential · {record.verifiedBy}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {certifications.length > 0 && (
        <section id="published-certifications" aria-labelledby="published-certifications-title">
          <h2 id="published-certifications-title">Licenses and certifications</h2>
          <p className="bw-public-person-section-help">Self-reported certifications, not independently verified by BrightWay.</p>
          <div className="bw-public-person-records">
            {certifications.map((item, index) => (
              <article className="bw-public-person-record" key={index}>
                <span className="bw-public-person-record-icon"><Icon name="book" /></span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.issuer}</p>
                  <small>Issued {item.issuedMonth}{item.expiresMonth ? ` · Expires ${item.expiresMonth}` : ""}</small>
                  {/^https:\/\//i.test(item.credentialUrl || "") && (
                    <a href={item.credentialUrl} target="_blank" rel="noopener noreferrer">View certificate</a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {achievements.length > 0 && (
        <section id="published-achievements" aria-labelledby="published-achievements-title">
          <h2 id="published-achievements-title">Professional achievements</h2>
          <div className="bw-public-person-achievements">
            {achievements.map(item => (
              <article className="bw-public-person-achievement" key={item.id}>
                <div className="bw-public-person-achievement-meta">
                  <strong><Icon name="sprout" /> Achievement</strong>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time>
                </div>
                <p>{item.body}</p>
                {item.tags?.length > 0 && <ul className="bw-public-person-list">
                  {item.tags.map(tag => <li key={tag}>{tag}</li>)}
                </ul>}
                <Link to={`/explore?source=member&post=${encodeURIComponent(item.id)}`}>View achievement</Link>
              </article>
            ))}
          </div>
        </section>
      )}
      {hasDirection && <section id="published-direction" aria-labelledby="published-direction-title">
        <h2 id="published-direction-title">Career direction</h2>
        {field && <strong className="bw-public-person-field">{field}</strong>}
        {profile.careerGoals && <p>{profile.careerGoals}</p>}
      </section>}
      {skills.length > 0 && <section id="published-skills" aria-labelledby="published-skills-title">
        <h2 id="published-skills-title">Skills</h2>
        <ul className="bw-public-person-list">{skills.map(item => <li key={item}>{item}</li>)}</ul>
      </section>}
      {interests.length > 0 && <section id="published-interests" aria-labelledby="published-interests-title">
        <h2 id="published-interests-title">Interests</h2>
        <ul className="bw-public-person-list bw-public-person-list--muted">{interests.map(item => <li key={item}>{item}</li>)}</ul>
      </section>}
    </div>

    <p className="bw-public-person-note">
      Profiles and professional details are visible to signed-in members.
      Email, phone and WhatsApp details follow the member's contact visibility choices.
      Verification evidence is restricted. Only reviewed credentials carry a verified label.
    </p>
  </article>;
}

export default function PublicPersonPage() {
  const { username = "" } = useParams();
  const { account } = useAuth();
  return <PublishedPerson key={JSON.stringify([account.id, username])} username={username} />;
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { notificationsApi } from "../api/notifications";
import { useAuth } from "../auth/useAuth";
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
          <span className="bw-public-person-status">Published profile</span>
          <h1>{profile.fullName}</h1>
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

    {(profile.bio || hasDirection || skills.length || interests.length) && (
      <nav className="bw-public-person-nav" aria-label="Published profile sections">
        {profile.bio && <a href="#published-about">About</a>}
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
      This view includes only details the member chose to publish. Contact, education,
      and experience information are not shown here.
    </p>
  </article>;
}

export default function PublicPersonPage() {
  const { username = "" } = useParams();
  const { account } = useAuth();
  return <PublishedPerson key={JSON.stringify([account.id, username])} username={username} />;
}

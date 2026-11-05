import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { notificationsApi } from "../api/notifications";
import { useAuth } from "../auth/useAuth";
import "./public-person.css";

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

function locationLabel(location) {
  return [location.locality, location.region, location.countryCode ? regionNames?.of(location.countryCode) || location.countryCode : null].filter(Boolean).join(", ");
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

  if (!result) return <section className="bw-public-person"><p role="status">Opening profile…</p></section>;
  const { profile, error } = result;
  if (error) return <section className="bw-public-person"><Link to="/network">Back to Network</Link><h1>Profile unavailable</h1><p role="alert">{error.message}</p></section>;

  const field = profile.careerField?.mode === "EXPLORING" ? "Exploring career options" : profile.careerField?.label;
  const location = locationLabel(profile.location);
  return <article className="bw-public-person">
    <Link to="/network">Back to Network</Link>
    <header>
      <span className="bw-public-person-avatar" aria-hidden="true">{profile.fullName.slice(0, 1).toUpperCase()}</span>
      <div><h1>{profile.fullName}</h1><p>@{profile.username}</p>{profile.headline && <p className="bw-public-person-headline">{profile.headline}</p>}</div>
    </header>
    {location && <p className="bw-public-person-location">{location}</p>}
    {profile.bio && <section><h2>About</h2><p>{profile.bio}</p></section>}
    {field && <section><h2>Career direction</h2><p>{field}</p>{profile.careerGoals && <p>{profile.careerGoals}</p>}</section>}
    {profile.skills.length > 0 && <section><h2>Skills</h2><ul>{profile.skills.map(item => <li key={item}>{item}</li>)}</ul></section>}
    {profile.interests.length > 0 && <section><h2>Interests</h2><ul>{profile.interests.map(item => <li key={item}>{item}</li>)}</ul></section>}
    <p className="bw-public-person-note">Contact details are not displayed on this page.</p>
  </article>;
}

export default function PublicPersonPage() {
  const { username = "" } = useParams();
  const { account } = useAuth();
  return <PublishedPerson key={JSON.stringify([account.id, username])} username={username} />;
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { notificationsApi } from "../api/notifications";
import { useAuth } from "../auth/useAuth";
import "./public-person.css";

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

function locationLabel(location) {
  return [location.locality, location.region, location.countryCode ? regionNames?.of(location.countryCode) || location.countryCode : null].filter(Boolean).join(", ");
}

export default function PublicPersonPage() {
  const { username = "" } = useParams();
  const { account } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setProfile(null); setError(null); setLoading(true);
    notificationsApi.viewProfile(username, controller.signal)
      .then(value => { if (live) setProfile(value); })
      .catch(value => { if (live && value.name !== "AbortError") setError(value); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [account.id, username]);

  if (loading) return <section className="bw-public-person"><p role="status">Opening profile…</p></section>;
  if (error) return <section className="bw-public-person"><Link to="/network">Back to Network</Link><h1>Profile unavailable</h1><p role="alert">{error.message}</p></section>;
  if (!profile) return null;

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

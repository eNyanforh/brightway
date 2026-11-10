import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { notificationsApi } from "../api/notifications";
import { coverPhotoUrl } from "../api/profile";
import { memberPhotoUrl } from "../api/organization-posts";
import OrganizationAvatar from "../components/profile/OrganizationAvatar";
import { monthLabel } from "./profile-history-form";
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

function PersonAvatar({ username, photoId }) {
  if (photoId) return <img className="bw-public-person-avatar" src={memberPhotoUrl(username, photoId)} alt="Profile avatar" />;
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
  const [activeTab, setActiveTab] = useState("about");

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
  const activities = Array.isArray(profile.activities) ? profile.activities : [];
  const tabs = [
    { key: "about", label: "About Me", icon: "book" },
    { key: "achievements", label: "Achievements", icon: "sprout" },
    { key: "activities", label: "Activities", icon: "compass" },
  ];
  const onTabKeyDown = (event, index) => {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setActiveTab(tabs[next].key);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus();
  };

  return <article className="bw-public-person">
    <Link className="bw-public-person-back" to="/network">
      <span aria-hidden="true">←</span> Back to Network
    </Link>
    <div className="bw-public-person-hero">
      <div className={`bw-public-person-cover ${profile.coverPhoto?.id ? "has-photo" : ""}`} aria-label="Member cover photo">
        {profile.coverPhoto?.id && <img src={coverPhotoUrl(profile.username, profile.coverPhoto.id)}
          className="bw-public-person-cover-image" alt="" />}
      </div>
      <header className="bw-public-person-identity">
        <PersonAvatar username={profile.username} photoId={profile.photoId} />
        <div className="bw-public-person-intro">
          <h1 className="bw-public-person-name"><span>{profile.fullName}</span>{profile.identityVerified === true && <VerificationBadge />}</h1>
          <p className="bw-public-person-handle">@{profile.username}</p>
          {profile.headline && <p className="bw-public-person-headline">{profile.headline}</p>}
          {location && <p className="bw-public-person-location">{location}</p>}
        </div>
      </header>
    </div>



    <div className="bw-public-person-tabs" role="tablist" aria-label="Public profile sections">
      {tabs.map((tab, index) => (
        <button type="button" key={tab.key} id={`public-tab-${tab.key}`}
          className={`bw-public-person-tab ${activeTab === tab.key ? "is-active" : ""}`}
          role="tab" aria-selected={activeTab === tab.key}
          aria-controls={`public-panel-${tab.key}`}
          tabIndex={activeTab === tab.key ? 0 : -1}
          onClick={() => setActiveTab(tab.key)}
          onKeyDown={event => onTabKeyDown(event, index)}>
          <Icon name={tab.icon} />
          {tab.label}
        </button>
      ))}
    </div>
    <div className="bw-public-person-content">
      <div className="bw-public-person-panel" role="tabpanel" id="public-panel-about"
        aria-labelledby="public-tab-about" tabIndex={0} hidden={activeTab !== "about"}>
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

        {!profile.bio && !hasDirection && skills.length === 0 && interests.length === 0 && (
          <div className="bw-public-person-empty">
            <strong>No introduction added yet</strong>
            <p>This member has not added their professional introduction.</p>
          </div>
        )}
      </div>
      <div className="bw-public-person-panel" role="tabpanel" id="public-panel-achievements"
        aria-labelledby="public-tab-achievements" tabIndex={0} hidden={activeTab !== "achievements"}>
      {verifiedCredentials.length > 0 && (
        <section id="published-credentials" aria-labelledby="published-credentials-title">
          <h2 id="published-credentials-title">Verified credentials</h2>
          <p className="bw-public-person-section-help">Education and experience records reviewed by an authorized issuer or BrightWay.</p>
          <div className="bw-public-person-records">
            {verifiedCredentials.map(record => (
              <article className="bw-public-person-record bw-public-person-history-record" key={record.kind + record.id}>
                <OrganizationAvatar key={record.organizationAvatar?.photoUrl || record.id}
                  organization={record.organizationAvatar} className="bw-public-person-record-icon"
                  icon={record.kind === "education" ? "book" : "briefcase"} />
                <div className="bw-public-person-record-body">
                  <div className="bw-public-person-record-heading">
                    <span className="bw-public-person-credential-kind">
                      {record.kind === "education" ? "Education" : "Experience"}
                    </span>
                    <h3>{record.title}</h3>
                    <p className="bw-public-person-record-organization">{record.organizationAvatar ? (
                      <Link to={`/organizations/${record.organizationAvatar.id}`}>{record.organization}</Link>
                    ) : record.organization}</p>
                    <p className="bw-public-person-record-date">
                      {monthLabel(record.startMonth)} – {record.current ? "Present" : monthLabel(record.endMonth) || "Not specified"}
                    </p>
                  </div>
                  <div className="bw-public-person-record-footer">
                    <span className="bw-public-person-verified" aria-label="Verified credential">
                      ✓ Verified credential · {record.verifiedBy}
                    </span>
                  </div>
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

        {!verifiedCredentials.length && !certifications.length && !achievements.length && (
          <div className="bw-public-person-empty">
            <strong>No achievements added yet</strong>
            <p>Published achievements and professional credentials will appear here.</p>
          </div>
        )}
      </div>
      <div className="bw-public-person-panel" role="tabpanel" id="public-panel-activities"
        aria-labelledby="public-tab-activities" tabIndex={0} hidden={activeTab !== "activities"}>
        {activities.length > 0 ? (
          <section id="published-activities" aria-labelledby="published-activities-title">
            <div className="bw-public-person-activities-head">
              <h2 id="published-activities-title">Recent activity</h2>
              <p>Published posts from this member.</p>
            </div>
            <div className="bw-public-person-activities">
              {activities.map(item => (
                <article className="bw-public-person-activity" key={item.id}>
                  <div className="bw-public-person-achievement-meta">
                    <strong><Icon name={item.type === "ACHIEVEMENT" ? "sprout" : item.type === "EVENT" ? "compass" : "book"} />
                      {({ ACHIEVEMENT: "Achievement", EVENT: "Event", QUESTION: "Question", POST: "Post" })[item.type] || "Post"}
                    </strong>
                    <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time>
                  </div>
                  <p>{item.body}</p>
                  {item.tags?.length > 0 && (
                    <ul className="bw-public-person-list">
                      {item.tags.map(tag => <li key={tag}>{tag}</li>)}
                    </ul>
                  )}
                  <Link to={`/explore?source=member&post=${encodeURIComponent(item.id)}`}>
                    View post <Icon name="arrow" />
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <div className="bw-public-person-empty">
            <strong>No activity yet</strong>
            <p>Published achievements, events, questions and posts will appear here.</p>
          </div>
        )}
      </div>
    </div>

    <p className="bw-public-person-note">
      Member profiles, current profile photos and cover photos are visible to signed-in BrightWay members.
      Only contact details follow the member's contact visibility settings. Verification evidence remains restricted.
      Standalone certifications are self-reported; only reviewed records carry a verified label.
    </p>
  </article>;
}

export default function PublicPersonPage() {
  const { username = "" } = useParams();
  const { account } = useAuth();
  return <PublishedPerson key={JSON.stringify([account.id, username])} username={username} />;
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { memberPhotoUrl } from "../../api/organization-posts";
import AvatarGroup from "./AvatarGroup";

function AttendeeAvatar({ person }) {
  const photo = person.verified === true && person.photoId
    ? memberPhotoUrl(person.username, person.photoId) : null;
  const [failedPhoto, setFailedPhoto] = useState(null);
  return (
    <Link className="bw-event-attendee-avatar" to={"/people/" + encodeURIComponent(person.username)}
      title={person.name} aria-label={person.name + " registered to attend"}>
      {photo && failedPhoto !== photo
        ? <img src={photo} alt="" loading="lazy" onError={() => setFailedPhoto(photo)} />
        : <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.7 20c.35-4.3 3-6.4 7.3-6.4s6.95 2.1 7.3 6.4" />
          </svg>}
    </Link>
  );
}

export default function EventAttendeeSummary({ count = 0, attendees = [] }) {
  return (
    <div className="bw-event-attendee-summary" aria-label="Event registrations">
      {attendees.length > 0 && (
        <AvatarGroup max={3} className="bw-event-attendee-facepile" label="People registered to attend">
          {attendees.map(person => <AttendeeAvatar key={person.username} person={person} />)}
        </AvatarGroup>
      )}
      <span className="bw-event-attendee-count" aria-live="polite">
        <strong>{count.toLocaleString()}</strong> {count === 1 ? "person registered" : "people registered"}
      </span>
    </div>
  );
}

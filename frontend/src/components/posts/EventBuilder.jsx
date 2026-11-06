import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_POST_TOPICS, MAX_POST_TOPIC_LENGTH, normalizePostTopic } from "../../../../shared/post-topics.mjs";
import NavigationIcon from "../layout/NavigationIcon";

const covers = [
  { id: "NAVY", label: "Midnight" }, { id: "SUNSET", label: "Sunset" },
  { id: "FOREST", label: "Forest" }, { id: "VIOLET", label: "Violet" },
];
const formats = [
  { id: "IN_PERSON", label: "In person", icon: "pin" },
  { id: "ONLINE", label: "Online", icon: "network" },
  { id: "HYBRID", label: "Hybrid", icon: "calendar" },
];
const zones = ["Africa/Monrovia", "Africa/Accra", "Africa/Lagos", "Africa/Nairobi", "UTC", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore"];

function localInputValue(date) {
  const pad = value => String(value).padStart(2, "0");
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-")
    + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function zonedToIso(value, zone) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  const expected = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(expected)) return null;
  let estimate = expected;
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(estimate)).map(part => [part.type, part.value]));
    const displayed = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    estimate += expected - displayed;
  }
  return new Date(estimate).toISOString();
}

export default function EventBuilder({ body, tags, disabled, onBodyChange, onTagsChange, onCancel, onSubmit, triggerRef }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("IN_PERSON");
  const [venue, setVenue] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [coverTheme, setCoverTheme] = useState("NAVY");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [start, setStart] = useState(() => localInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [end, setEnd] = useState(() => localInputValue(new Date(Date.now() + 26 * 60 * 60 * 1000)));
  const [topicDraft, setTopicDraft] = useState("");
  const [topicError, setTopicError] = useState("");
  const limit = tags.length >= MAX_POST_TOPICS;
  const eventStart = zonedToIso(start, timezone);
  const eventEnd = zonedToIso(end, timezone);
  const validSchedule = Boolean(eventStart && eventEnd && Date.parse(eventEnd) > Date.parse(eventStart)
    && Date.parse(eventEnd) - Date.parse(eventStart) <= 30 * 24 * 60 * 60 * 1000);
  const validLocation = (format === "ONLINE" || Boolean(venue.trim()))
    && (format === "IN_PERSON" || /^https?:\/\/\S+$/i.test(meetingUrl));
  const valid = title.trim().length >= 3 && validSchedule && validLocation && body.trim() && tags.length
    && !topicDraft.trim() && !disabled;
  const allZones = zones.includes(timezone) ? zones : [timezone, ...zones];

  useEffect(() => {
    titleRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keyDown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!disabledRef.current) onCancel();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = [...dialogRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)")]
        .filter(el => el.getClientRects().length);
      if (!focusables.length) return;
      if (event.shiftKey && document.activeElement === focusables[0]) {
        event.preventDefault(); focusables.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === focusables.at(-1)) {
        event.preventDefault(); focusables[0].focus();
      }
    };
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("keydown", keyDown);
      document.body.style.overflow = previous;
      triggerRef?.current?.focus();
    };
  }, [onCancel, triggerRef]);

  function addTopic() {
    const normalized = normalizePostTopic(topicDraft);
    if (!normalized) { setTopicError("Enter a valid topic up to 32 characters."); return; }
    if (tags.some(tag => tag.toLowerCase() === normalized.toLowerCase())) {
      setTopicError("That topic is already added."); return;
    }
    if (limit) return;
    onTagsChange([...tags, normalized]);
    setTopicDraft("");
    setTopicError("");
  }

  function submit(event) {
    event.preventDefault();
    if (!valid) return;
    onSubmit(event, {
      title: title.trim(), startAt: eventStart, endAt: eventEnd,
      timezone, format, venue: format === "ONLINE" ? "" : venue.trim(),
      meetingUrl: format === "IN_PERSON" ? "" : meetingUrl.trim(),
      coverTheme,
    });
  }

  return createPortal(
    <div className="bw-event-modal-backdrop bw-post-panel" onMouseDown={event => {
      if (event.target === event.currentTarget && !disabled) onCancel();
    }}>
      <div className="bw-event-modal-dialog" role="dialog" aria-modal="true" aria-label="Create an Event" ref={dialogRef}>
        <form className="bw-event-builder" aria-label="Create a post" onSubmit={submit}>
          <header className="bw-event-builder-header">
            <div><span className="bw-event-eyebrow">BRIGHTWAY EVENTS</span><h2>Create an event</h2><p>Bring people together to learn, connect, and grow.</p></div>
            <button type="button" aria-label="Close editor" disabled={disabled} onClick={onCancel}>×</button>
          </header>
          <div className="bw-event-builder-content">
            <div className="bw-event-fields">
              <section className="bw-event-section" aria-label="Event information">
                <span className="bw-event-step">01 · DETAILS</span>
                <label htmlFor={titleId}>Event title</label>
                <input id={titleId} ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Young Innovators Workshop" maxLength={120} required disabled={disabled} />
                <label htmlFor={titleId + "-description"}>Description</label>
                <textarea id={titleId + "-description"} aria-label="Write an event" rows={4} maxLength={2000}
                  value={body} disabled={disabled} onChange={e => onBodyChange(e.target.value)}
                  placeholder="What will guests learn or experience? Who should attend?" required />
              </section>
              <section className="bw-event-section" aria-label="Schedule">
                <span className="bw-event-step">02 · WHEN</span>
                <div className="bw-event-two-fields">
                  <div><label htmlFor={titleId + "-start"}>Starts</label><input id={titleId + "-start"} type="datetime-local" value={start} onChange={e => setStart(e.target.value)} disabled={disabled} required /></div>
                  <div><label htmlFor={titleId + "-end"}>Ends</label><input id={titleId + "-end"} type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} disabled={disabled} required /></div>
                </div>
                <label htmlFor={titleId + "-zone"}>Timezone</label>
                <select id={titleId + "-zone"} value={timezone} onChange={e => setTimezone(e.target.value)} disabled={disabled}>
                  {allZones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
                </select>
                {!validSchedule && <p role="alert" className="bw-event-error">End time must be after start time and within 30 days.</p>}
              </section>
              <section className="bw-event-section" aria-label="Location">
                <span className="bw-event-step">03 · WHERE</span>
                <div className="bw-event-format-options" role="group" aria-label="Attendance format">
                  {formats.map(option => <button key={option.id} type="button" aria-pressed={format === option.id}
                    disabled={disabled} onClick={() => setFormat(option.id)}><NavigationIcon name={option.icon} size={17} />{option.label}</button>)}
                </div>
                {format !== "ONLINE" && <><label htmlFor={titleId + "-venue"}>Venue or address</label>
                  <input id={titleId + "-venue"} placeholder="Venue name, street and city" value={venue} onChange={e => setVenue(e.target.value)} maxLength={240} disabled={disabled} required /></>}
                {format !== "IN_PERSON" && <><label htmlFor={titleId + "-link"}>Meeting link</label>
                  <input id={titleId + "-link"} type="url" placeholder="https://meet.google.com/..." value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} maxLength={500} disabled={disabled} required /></>}
              </section>
              <section className="bw-event-section" aria-label="Discovery">
                <span className="bw-event-step">04 · DISCOVERY</span>
                <label htmlFor={titleId + "-topics"}>Event topics</label>
                <p>Choose at least one subject to help people discover your event.</p>
                <div className="bw-event-topic-input"><input id={titleId + "-topics"} aria-label="Topic tags" value={topicDraft}
                  onChange={e => { setTopicDraft(e.target.value); setTopicError(""); }} maxLength={MAX_POST_TOPIC_LENGTH+1}
                  placeholder="e.g. Education" disabled={disabled || limit}
                  onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addTopic(); } }} />
                  <button type="button" disabled={!topicDraft.trim() || limit || disabled} onClick={addTopic}>Add tag</button></div>
                {topicError && <p role="alert" className="bw-event-error">{topicError}</p>}
                <ul className="bw-event-selected-tags" aria-label="Selected topic tags">
                  {tags.map(tag => <li key={tag}>{tag}<button type="button" aria-label={"Remove tag " + tag} disabled={disabled}
                    onClick={() => onTagsChange(tags.filter(item => item !== tag))}>×</button></li>)}
                </ul>
                <span className="bw-event-hint">{tags.length}/{MAX_POST_TOPICS} topics selected</span>
              </section>
            </div>
            <aside className="bw-event-preview-panel" aria-label="Event preview">
              <span className="bw-event-step">LIVE PREVIEW</span>
              <div className="bw-event-preview-card">
                <div className="bw-event-cover" data-theme={coverTheme}><span>BRIGHTWAY EVENT</span><NavigationIcon name="calendar" size={48} /></div>
                <div className="bw-event-preview-details">
                  <strong>{title.trim() || "Your event title"}</strong>
                  <span><NavigationIcon name="calendar" size={15} /> {start ? new Date(eventStart).toLocaleString("en", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }) : "Choose a date"}</span>
                  <span><NavigationIcon name="pin" size={15} /> {format === "ONLINE" ? "Online event" : venue || (format === "HYBRID" ? "Hybrid event" : "Add a location")}</span>
                </div>
              </div>
              <span className="bw-event-theme-label">Cover style</span>
              <div className="bw-event-cover-options" role="group" aria-label="Event cover style">
                {covers.map(cover => <button key={cover.id} type="button" data-theme={cover.id} aria-label={cover.label}
                  aria-pressed={coverTheme === cover.id} disabled={disabled} onClick={() => setCoverTheme(cover.id)} />)}
              </div>
              <p>Preview of how your event will appear in the BrightWay feed.</p>
            </aside>
          </div>
          <footer className="bw-event-builder-footer">
            <span>Event posts are public. Guest registration and ticketing are not enabled yet.</span>
            <div><button type="button" onClick={onCancel} disabled={disabled}>Cancel</button><button className="bw-event-publish" type="submit" disabled={!valid}>Publish event</button></div>
          </footer>
        </form>
      </div>
    </div>, document.body
  );
}

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_POST_TOPICS, normalizePostTopic } from "../../../../shared/post-topics.mjs";
import NavigationIcon from "../layout/NavigationIcon";
import { PostTopicTags } from "./PersonalPostComposer";

const toUtcInput = value => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 16) : "";
};
const moneyText = cents => ((cents || 0) / 100).toFixed(2);
const emptyEvent = {
  title: "", startAt: "", endAt: "", timezone: "Africa/Monrovia",
  format: "IN_PERSON", venue: "", meetingUrl: "", coverTheme: "NAVY",
  ticketPriceCents: 0, currency: "USD", requiresApproval: false, capacity: null,
};
function initialDraft(post) {
  return {
    body: post.body,
    tags: [...(post.tags || [])],
    title: post.questionDetails?.title || post.body,
    intent: post.questionDetails?.intent || "GUIDANCE",
    event: {
      ...emptyEvent, ...(post.eventDetails || {}),
      startAt: toUtcInput(post.eventDetails?.startAt),
      endAt: toUtcInput(post.eventDetails?.endAt),
      ticketPrice: moneyText(post.eventDetails?.ticketPriceCents),
      capacity: post.eventDetails?.capacity == null ? "" : String(post.eventDetails.capacity),
    },
  };
}

export default function PostManageMenu({
  post, busy = false, canManage = false, canReport = false,
  onEdit, onDelete, onReport, onCopyLink, onSave,
}) {
  const trigger = useRef(null);
  const menu = useRef(null);
  const dialog = useRef(null);
  const id = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const [portalRoot, setPortalRoot] = useState(null);
  const [draft, setDraft] = useState(() => initialDraft(post));
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const locked = saving || busy;
  const canSave = typeof post.saved === "boolean" && typeof onSave === "function";

  useEffect(() => { savingRef.current = locked; }, [locked]);
  useEffect(() => {
    if (menuOpen) menu.current?.querySelector('[role="menuitem"]')?.focus();
  }, [menuOpen]);
  const member = Boolean(post.member);
  const isEvent = post.type === "EVENT";
  const isQuestion = post.type === "QUESTION";

  useEffect(() => {
    if (!menuOpen) return undefined;
    const outside = event => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target))
        setMenuOpen(false);
    };
    const keydown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keydown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!mode || !dialog.current) return undefined;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (element.querySelector("textarea") || element.querySelector("button"))?.focus();
    const keydown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingRef.current) setMode(null);
      }
      if (event.key !== "Tab") return;
      const focusable = [...element.querySelectorAll("button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled)")];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault(); focusable.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault(); focusable[0].focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else trigger.current?.focus();
    };
  }, [mode]);

  function choose(next) {
    setPortalRoot(trigger.current?.closest("dialog") || document.body);
    setMenuOpen(false);
    setDraft(initialDraft(post));
    setError("");
    setTagDraft("");
    setMode(next);
  }
  function runMenuAction(action) {
    setMenuOpen(false);
    trigger.current?.focus();
    action?.();
  }
  function addTag(raw) {
    const tag = normalizePostTopic(raw);
    if (!tag) return setError("Enter a valid topic tag.");
    if (draft.tags.some(item => item.toLowerCase() === tag.toLowerCase()))
      return setError("This topic is already selected.");
    if (draft.tags.length >= MAX_POST_TOPICS) return setError("You have reached the topic limit.");
    setDraft(current => ({ ...current, tags: [...current.tags, tag] }));
    setTagDraft(""); setError("");
  }
  function editEvent(field, value) {
    setDraft(current => ({ ...current, event: { ...current.event, [field]: value } }));
  }

  async function save(event) {
    event.preventDefault();
    if (locked) return;
    setError("");
    if (!draft.body.trim() || draft.body.trim().length > 2000)
      return setError("Write 1 to 2,000 characters.");
    if (member && !draft.tags.length) return setError("Choose at least one topic tag.");
    if (tagDraft.trim()) return setError("Add or clear the unfinished topic tag.");
    let payload = { expectedBody: post.body, body: draft.body.trim() };
    if (member) {
      payload = { ...payload, expectedTags: post.tags || [], tags: draft.tags };
      if (isQuestion) {
        if (draft.title.trim().length < 10 || draft.title.trim().length > 180)
          return setError("The question title must be 10 to 180 characters.");
        payload.questionDetails = { title: draft.title.trim(), intent: draft.intent };
      }
      if (isEvent) {
        const { event: e } = draft;
        if (!e.startAt || !e.endAt || !Number.isFinite(Date.parse(e.startAt + "Z"))
          || !Number.isFinite(Date.parse(e.endAt + "Z")))
          return setError("Enter valid event start and end dates in UTC.");
        if (!/^\d+(?:\.\d{1,2})?$/.test(e.ticketPrice) || Number(e.ticketPrice) > 1000000)
          return setError("Enter a valid ticket price.");
        if (e.capacity !== "" && (!/^[1-9]\d*$/.test(e.capacity) || Number(e.capacity) > 100000))
          return setError("Enter a valid capacity or leave it unlimited.");
        payload.eventDetails = {
          title: e.title.trim(), startAt: new Date(e.startAt + "Z").toISOString(),
          endAt: new Date(e.endAt + "Z").toISOString(), timezone: e.timezone,
          format: e.format, venue: e.venue.trim(), meetingUrl: e.meetingUrl.trim(),
          coverTheme: e.coverTheme, ticketPriceCents: Math.round(Number(e.ticketPrice) * 100),
          currency: e.currency, requiresApproval: e.requiresApproval,
          capacity: e.capacity === "" ? null : Number(e.capacity),
        };
      }
    }
    setSaving(true);
    try {
      await onEdit(post, payload);
      setMode(null);
    } catch (failure) {
      setError(failure.message || "Could not edit this post.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (locked) return;
    setError(""); setSaving(true);
    try {
      await onDelete(post);
      setMode(null);
    } catch (failure) {
      setError(failure.message || "Could not delete this post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="bw-post-manage">
        <button ref={trigger} type="button" className="bw-post-options-trigger"
          aria-label="Post options" title="Post options"
          aria-expanded={menuOpen} aria-controls={menuOpen ? id : undefined}
          disabled={locked} onClick={() => setMenuOpen(value => !value)}>
          <NavigationIcon name="more-horizontal" size={20} />
        </button>
        {menuOpen && (
          <div ref={menu} id={id} className="bw-post-options-dropdown" role="menu" aria-label="Post options"
            onKeyDown={event => {
              const items = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
              const index = items.indexOf(document.activeElement);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                (event.key === "Home" ? items[0] : items.at(-1))?.focus();
              }
            }}>
            {canManage && <>
              <button type="button" role="menuitem" onClick={() => choose("edit")}>
                <NavigationIcon name="edit" size={17} /> Edit post
              </button>
              <button type="button" role="menuitem" className="bw-post-options-delete" onClick={() => choose("delete")}>
                <NavigationIcon name="trash" size={17} /> Delete post
              </button>
            </>}
            <button type="button" role="menuitem" onClick={() => runMenuAction(onCopyLink)}>
              <NavigationIcon name="link" size={17} /> Copy link
            </button>
            {canSave && <button type="button" role="menuitem" onClick={() => runMenuAction(onSave)}>
              <NavigationIcon name="bookmark" size={17} />
              {post.saved ? "Remove from saved" : "Save post"}
            </button>}
            {canReport && <button type="button" role="menuitem" className="bw-post-options-report"
              onClick={() => runMenuAction(onReport)}>
              <NavigationIcon name="flag" size={17} /> Report post
            </button>}
          </div>
        )}
      </div>
      {mode && createPortal(
        <div className="bw-post-manage-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget && !locked) setMode(null);
        }}>
          <div ref={dialog} className="bw-post-manage-dialog" role="dialog" aria-modal="true"
            aria-label={mode === "edit" ? "Edit post" : "Delete post"}>
            {mode === "delete" ? (
              <>
                <header><h2>Delete post?</h2>
                  <button type="button" aria-label="Close dialog" disabled={locked} onClick={() => setMode(null)}>×</button>
                </header>
                <p>This post will be removed from BrightWay’s community feed and your Activity. It cannot be restored.</p>
                {error && <p className="bw-post-manage-error" role="alert">{error}</p>}
                <div className="bw-post-manage-actions">
                  <button type="button" disabled={locked} onClick={() => setMode(null)}>Cancel</button>
                  <button type="button" className="bw-post-manage-danger" disabled={locked} onClick={() => void remove()}>
                    {saving ? "Deleting…" : "Delete post"}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={event => void save(event)}>
                <header><h2>Edit post</h2>
                  <button type="button" aria-label="Close dialog" disabled={locked} onClick={() => setMode(null)}>×</button>
                </header>
                <div className="bw-post-manage-fields">
                  <label>{isQuestion ? "Question description" : isEvent ? "Event description" : "Post description"}
                    <textarea rows={4} maxLength={2000} value={draft.body} disabled={locked}
                      onChange={event => setDraft(current => ({ ...current, body: event.target.value }))} />
                  </label>
                  <small>{draft.body.length} / 2,000</small>
                  {member && (
                    <div className="bw-post-manage-topics">
                      <label htmlFor={id + "-topic"}>Topic tags</label>
                      <PostTopicTags tags={draft.tags} disabled={locked}
                        onRemove={tag => setDraft(current => ({ ...current, tags: current.tags.filter(item => item !== tag) }))} />
                      <div>
                        <input id={id + "-topic"} value={tagDraft} disabled={locked || draft.tags.length >= MAX_POST_TOPICS}
                          placeholder="Add topic" maxLength={33}
                          onChange={event => setTagDraft(event.target.value)}
                          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (tagDraft.trim()) addTag(tagDraft); } }} />
                        <button type="button" disabled={locked || !tagDraft.trim() || draft.tags.length >= MAX_POST_TOPICS}
                          onClick={() => addTag(tagDraft)}>Add topic</button>
                      </div>
                    </div>
                  )}
                  {isQuestion && <>
                    <label>Question title
                      <input value={draft.title} maxLength={180} disabled={locked}
                        onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
                    </label>
                    <label>Question type
                      <select value={draft.intent} disabled={locked}
                        onChange={event => setDraft(current => ({ ...current, intent: event.target.value }))}>
                        <option value="EXPLANATION">Explanation</option>
                        <option value="FEEDBACK">Feedback</option>
                        <option value="GUIDANCE">Guidance</option>
                        <option value="DISCUSSION">Discussion</option>
                      </select>
                    </label>
                  </>}
                  {isEvent && <>
                    <label>Event title <input value={draft.event.title} maxLength={120} disabled={locked}
                      onChange={event => editEvent("title", event.target.value)} /></label>
                    <div className="bw-post-manage-two">
                      <label>Start (UTC) <input type="datetime-local" value={draft.event.startAt} disabled={locked}
                        onChange={event => editEvent("startAt", event.target.value)} /></label>
                      <label>End (UTC) <input type="datetime-local" value={draft.event.endAt} disabled={locked}
                        onChange={event => editEvent("endAt", event.target.value)} /></label>
                    </div>
                    <div className="bw-post-manage-two">
                      <label>Timezone <input value={draft.event.timezone} maxLength={100} disabled={locked}
                        onChange={event => editEvent("timezone", event.target.value)} /></label>
                      <label>Format <select value={draft.event.format} disabled={locked}
                        onChange={event => editEvent("format", event.target.value)}>
                        <option value="IN_PERSON">In person</option><option value="ONLINE">Online</option>
                        <option value="HYBRID">Hybrid</option>
                      </select></label>
                    </div>
                    {draft.event.format !== "ONLINE" && <label>Venue
                      <input value={draft.event.venue} maxLength={240} disabled={locked}
                        onChange={event => editEvent("venue", event.target.value)} />
                    </label>}
                    {draft.event.format !== "IN_PERSON" && <label>Meeting URL
                      <input type="url" value={draft.event.meetingUrl} maxLength={500} disabled={locked}
                        onChange={event => editEvent("meetingUrl", event.target.value)} />
                    </label>}
                    <div className="bw-post-manage-two">
                      <label>Ticket price <input type="number" min="0" max="1000000" step=".01"
                        value={draft.event.ticketPrice} disabled={locked}
                        onChange={event => editEvent("ticketPrice", event.target.value)} /></label>
                      <label>Currency <select value={draft.event.currency} disabled={locked}
                        onChange={event => editEvent("currency", event.target.value)}>
                        <option value="USD">USD</option><option value="LRD">LRD</option>
                      </select></label>
                    </div>
                    <div className="bw-post-manage-two">
                      <label>Capacity (optional) <input type="number" min="1" max="100000"
                        value={draft.event.capacity} disabled={locked}
                        onChange={event => editEvent("capacity", event.target.value)} /></label>
                      <label>Cover theme <select value={draft.event.coverTheme} disabled={locked}
                        onChange={event => editEvent("coverTheme", event.target.value)}>
                        <option value="NAVY">Midnight</option><option value="SUNSET">Sunset</option>
                        <option value="FOREST">Forest</option><option value="VIOLET">Violet</option>
                      </select></label>
                    </div>
                    <label className="bw-post-manage-checkbox">
                      <input type="checkbox" checked={draft.event.requiresApproval} disabled={locked}
                        onChange={event => editEvent("requiresApproval", event.target.checked)} /> Require attendance approval
                    </label>
                    <small>Once anyone requests or registers to attend, event schedule, location, price, approval and capacity are locked.</small>
                  </>}
                </div>
                {error && <p className="bw-post-manage-error" role="alert">{error}</p>}
                <div className="bw-post-manage-actions">
                  <button type="button" disabled={locked} onClick={() => setMode(null)}>Cancel</button>
                  <button className="bw-post-manage-save" type="submit" disabled={locked || !draft.body.trim()}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>, portalRoot || document.body
      )}
    </>
  );
}

import { useCallback, useState } from "react";
import { managementToolsApi } from "../api/management-tools";
import { useManagement } from "../auth/management-context";
import ManagementActionDialog from "../components/management/ManagementActionDialog";
import ManagementPageHeader from "../components/management/ManagementPageHeader";
import { ManagementQueue, ManagementQueueRow } from "../components/management/ManagementQueue";
import { useManagementResource } from "../components/management/useManagementResource";
import "./management-tools.css";

const types = { POST: "Post", ACHIEVEMENT: "Achievement", QUESTION: "Question", EVENT: "Event" };
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const views = [
  { value: "PUBLISHED", label: "Published" },
  { value: "PENDING", label: "Pending review" },
  { value: "REJECTED", label: "Removed / declined" },
];
export default function ManagementPostReviewsPage() {
  const { staff } = useManagement();
  return <PostReviewDesk key={staff.id} staffId={staff.id} />;
}
function PostReviewDesk({ staffId }) {
  const [filter, setFilter] = useState("PUBLISHED");
  const [pages, setPages] = useState([null]);
  const [selectedId, setSelectedId] = useState(null);
  const [decision, setDecision] = useState(null);
  const [notice, setNotice] = useState("");
  const cursor = pages.at(-1);
  const clearSelection = useCallback(() => { setSelectedId(null); setDecision(null); }, []);
  const fetcher = useCallback(signal => managementToolsApi.postReviews(cursor, filter, signal), [cursor, filter]);
  const queue = useManagementResource(staffId + ":" + filter + ":" + (cursor || "first"), fetcher, clearSelection);
  const items = queue.data?.items ?? [];
  const selected = items.find(item => item.id === selectedId);
  const unavailable = queue.loading || Boolean(queue.error);
  const title = filter === "PENDING" ? "Pending submissions"
    : filter === "PUBLISHED" ? "Published posts" : "Removed and declined posts";

  function start(status) {
    if (!selected || selected.moderationStatus === status) return;
    setNotice("");
    setDecision({ decision: status, expectedVersion: selected.moderationVersion, requestKey: crypto.randomUUID() });
  }
  async function confirm(reason) {
    if (!selected || !decision) return;
    const result = await managementToolsApi.reviewPost(selected.id, { ...decision, reason });
    setNotice(result.moderationStatus === "PUBLISHED"
      ? "Post published or restored." : filter === "PUBLISHED"
        ? "Published post removed from public discovery and interactions."
        : "Post declined. Feedback is available to its author.");
    clearSelection();
    await queue.refresh();
  }
  function changePage(value) {
    clearSelection();
    setNotice("");
    setPages(value);
  }
  function chooseFilter(value) {
    if (value === filter) return;
    setFilter(value);
    changePage([null]);
  }
  const removingPublishedPost = selected?.moderationStatus === "PUBLISHED" && decision?.decision === "REJECTED";
  return (
    <section className="bw-mgmt-tools-page">
      <ManagementPageHeader eyebrow="BRIGHTWAY / MODERATION" title="Post review"
        description="Eligible member posts publish immediately. Review published posts, remove policy violations, and approve revisions or restore posts after Management action."
        action={<button type="button" disabled={queue.loading || Boolean(decision)} onClick={() => void queue.refresh()}>Refresh queue</button>} />
      <nav className="bw-mgmt-post-filters" aria-label="Post moderation status">
        {views.map(view => <button type="button" key={view.value} aria-pressed={filter === view.value}
          disabled={Boolean(decision)} onClick={() => chooseFilter(view.value)}>{view.label}</button>)}
      </nav>
      {queue.error && <p role="alert">{queue.error.message} <button type="button" onClick={() => changePage([null])}>Start from beginning</button></p>}
      {notice && <p className="bw-mgmt-notice" role="status">{notice}</p>}
      <div className="bw-mgmt-review-desk">
        <ManagementQueue title={title} count={items.length}>
          {queue.loading && <p role="status">Loading submissions…</p>}
          {!unavailable && !items.length && <p>No posts in this review category on this page.</p>}
          <ul>{items.map(item => (
            <ManagementQueueRow key={item.id} title={"@" + item.author.username}
              reference={"#" + item.id.slice(0, 8)} status={types[item.type] || "Post"}
              meta={date.format(new Date(item.createdAt)) + " UTC"}
              selected={selected?.id === item.id} disabled={unavailable || Boolean(decision)}
              onClick={() => { setSelectedId(item.id); setNotice(""); }} />
          ))}</ul>
          <div className="bw-mgmt-post-page-actions">
            <button type="button" disabled={pages.length < 2 || queue.loading || Boolean(decision)}
              onClick={() => changePage(pages.slice(0, -1))}>Previous page</button>
            <button type="button" disabled={!queue.data?.nextCursor || queue.loading || Boolean(decision)}
              onClick={() => changePage([...pages, queue.data.nextCursor])}>Next page</button>
          </div>
        </ManagementQueue>
        <section className="bw-mgmt-case-detail" aria-label="Selected post">
          {selected ? <article className="bw-mgmt-tool-card">
            <span className="bw-mgmt-card-eyebrow">{selected.moderationStatus} · REVISION {selected.moderationVersion}</span>
            <h2>{types[selected.type] || "Post"} by @{selected.author.username}</h2>
            {selected.type === "QUESTION" && selected.questionDetails && <h3>{selected.questionDetails.title}</h3>}
            {selected.type === "EVENT" && selected.eventDetails && <div className="bw-mgmt-post-meta">
              <h3>{selected.eventDetails.title}</h3>
              <p>{selected.eventDetails.format} · {selected.eventDetails.venue || "Online"}</p>
              <p>Starts {date.format(new Date(selected.eventDetails.startAt))} UTC</p>
            </div>}
            <p className="bw-mgmt-post-body">{selected.body}</p>
            {selected.tags.length > 0 && <ul className="bw-mgmt-post-tags" aria-label="Topic tags">
              {selected.tags.map(tag => <li className="bw-mgmt-tag" key={tag}>{tag}</li>)}
            </ul>}
            <div className="bw-mgmt-record-actions">
              {selected.moderationStatus !== "PUBLISHED" && <button type="button" className="bw-mgmt-primary"
                disabled={unavailable} onClick={() => start("PUBLISHED")}>
                {selected.moderationStatus === "REJECTED" ? "Restore post" : "Approve post"}
              </button>}
              {selected.moderationStatus !== "REJECTED" && <button type="button" disabled={unavailable}
                onClick={() => start("REJECTED")}>
                {selected.moderationStatus === "PUBLISHED" ? "Remove post" : "Decline post"}
              </button>}
            </div>
          </article> : <div className="bw-mgmt-review-placeholder">
            <h2>Select a post</h2>
            <p>Inspect published content against BrightWay community guidelines. Management can remove and restore posts.</p>
          </div>}
        </section>
      </div>
      {decision && selected && <ManagementActionDialog
        title={removingPublishedPost ? "Remove this published post"
          : decision.decision === "PUBLISHED"
            ? selected.moderationStatus === "REJECTED" ? "Restore this post" : "Approve this post"
            : "Decline this post"}
        description={removingPublishedPost
          ? "This immediately hides the post from feeds, search, public profiles and interactions. Give the author a clear reason."
          : decision.decision === "PUBLISHED"
            ? "Confirm this content meets BrightWay's academic and career posting policy. Your reason is recorded in the audit log."
            : "Give the author actionable feedback. Declined content stays private until an authorized staff member restores it or reviews a revision."}
        onClose={() => { setDecision(null); void queue.refresh(); }} onConfirm={confirm} />}
    </section>
  );
}

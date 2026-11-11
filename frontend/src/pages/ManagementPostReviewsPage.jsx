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

export default function ManagementPostReviewsPage() {
  const { staff } = useManagement();
  return <PostReviewDesk key={staff.id} staffId={staff.id} />;
}

function PostReviewDesk({ staffId }) {
  const [pages, setPages] = useState([null]);
  const [selectedId, setSelectedId] = useState(null);
  const [decision, setDecision] = useState(null);
  const [notice, setNotice] = useState("");
  const cursor = pages.at(-1);
  const clearSelection = useCallback(() => { setSelectedId(null); setDecision(null); }, []);
  const fetcher = useCallback(signal => managementToolsApi.postReviews(cursor, signal), [cursor]);
  const queue = useManagementResource(staffId + ":" + (cursor || "first"), fetcher, clearSelection);
  const items = queue.data?.items ?? [];
  const selected = items.find(item => item.id === selectedId);
  const unavailable = queue.loading || Boolean(queue.error);

  function start(status) {
    if (!selected) return;
    setNotice("");
    setDecision({ decision: status, expectedVersion: selected.moderationVersion, requestKey: crypto.randomUUID() });
  }
  async function confirm(reason) {
    if (!selected || !decision) return;
    const result = await managementToolsApi.reviewPost(selected.id, { ...decision, reason });
    setNotice(result.moderationStatus === "PUBLISHED" ? "Post approved and published." : "Post declined. Feedback is available to the author.");
    clearSelection();
    await queue.refresh();
  }
  function changePage(value) {
    clearSelection();
    setNotice("");
    setPages(value);
  }

  return (
    <section className="bw-mgmt-tools-page">
      <ManagementPageHeader eyebrow="BRIGHTWAY / MODERATION" title="Post review"
        description="Review verified members’ achievements, questions and events before publication. Automated safety flags are advisory; you make the final decision."
        action={<button type="button" disabled={queue.loading || Boolean(decision)} onClick={() => void queue.refresh()}>Refresh queue</button>} />
      {queue.error && <p role="alert">{queue.error.message} <button type="button" onClick={() => changePage([null])}>Start from beginning</button></p>}
      {notice && <p className="bw-mgmt-notice" role="status">{notice}</p>}
      <div className="bw-mgmt-review-desk">
        <ManagementQueue title="Pending submissions" count={items.length}>
          {queue.loading && <p role="status">Loading submissions…</p>}
          {!unavailable && !items.length && <p>No submissions are waiting on this page.</p>}
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
            <span className="bw-mgmt-card-eyebrow">PENDING REVIEW · REVISION {selected.moderationVersion}</span>
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
            <p className="bw-mgmt-post-screen">Automated safety check: <strong>{({
              CLEAR: "No categories flagged",
              FLAGGED: "Potential harm flagged — review carefully",
              UNAVAILABLE: "Provider unavailable — manual review required",
              NOT_CONFIGURED: "Not configured — manual review required",
            })[selected.moderationScreenStatus] || "Not screened"}</strong></p>
            {selected.moderationFlags?.length > 0 && <p className="bw-mgmt-post-screen">
              Categories: {selected.moderationFlags.join(", ")}</p>}
            <div className="bw-mgmt-record-actions">
              <button type="button" className="bw-mgmt-primary" disabled={unavailable} onClick={() => start("PUBLISHED")}>Approve post</button>
              <button type="button" disabled={unavailable} onClick={() => start("REJECTED")}>Decline post</button>
            </div>
          </article> : <div className="bw-mgmt-review-placeholder">
            <h2>Select a submission</h2>
            <p>Review the wording, title, topic tags and safety signals before recording a decision.</p>
          </div>}
        </section>
      </div>
      {decision && selected && <ManagementActionDialog
        title={decision.decision === "PUBLISHED" ? "Approve this post" : "Decline this post"}
        description={decision.decision === "PUBLISHED"
          ? "Confirm the post follows BrightWay’s learning and career policy. Your reason is saved in the audit log."
          : "Give clear feedback to the author. The declined post remains private until revised and reviewed."}
        onClose={() => { setDecision(null); void queue.refresh(); }} onConfirm={confirm} />}
    </section>
  );
}

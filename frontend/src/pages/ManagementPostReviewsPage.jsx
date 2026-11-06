import { useCallback, useState } from "react";
import { managementToolsApi } from "../api/management-tools";
import { useManagement } from "../auth/management-context";
import ManagementActionDialog from "../components/management/ManagementActionDialog";
import ManagementPageHeader from "../components/management/ManagementPageHeader";
import { ManagementQueue, ManagementQueueRow } from "../components/management/ManagementQueue";
import { useManagementResource } from "../components/management/useManagementResource";
import "./management-tools.css";

const types = { POST: "Post", ACHIEVEMENT: "Achievement", EVENT: "Event" };
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default function ManagementPostReviewsPage() {
  const { staff } = useManagement();
  return <PostReviewDesk key={staff.id} staffId={staff.id} />;
}

function PostReviewDesk({ staffId }) {
  const [selectedId, setSelectedId] = useState(null);
  const [decision, setDecision] = useState(null);
  const [notice, setNotice] = useState("");
  const clearSelection = useCallback(() => { setSelectedId(null); setDecision(null); }, []);
  const queue = useManagementResource(staffId, managementToolsApi.postReviews, clearSelection);
  const items = queue.data?.items ?? [];
  const selected = items.find(item => item.id === selectedId);
  const unavailable = queue.loading || Boolean(queue.error);

  function start(status) {
    setNotice("");
    setDecision({ decision: status, requestKey: crypto.randomUUID() });
  }

  async function confirm(reason) {
    try {
      await managementToolsApi.reviewPost(selected.id, { ...decision, reason });
      setNotice(decision.decision === "PUBLISHED" ? "Post approved." : "Post declined.");
      clearSelection();
      await queue.refresh();
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        clearSelection();
        queue.clear(error);
      }
      throw error;
    }
  }

  return (
    <section className="bw-mgmt-tools-page">
      <ManagementPageHeader eyebrow="BRIGHTWAY / MODERATION" title="Post review"
        description="Review the oldest pending personal submissions. Approvals make eligible posts visible in Explore."
        action={<button type="button" disabled={queue.loading || Boolean(decision)} onClick={() => void queue.refresh()}>Refresh queue</button>} />
      {queue.error && <p role="alert">{queue.error.message}</p>}
      {notice && <p className="bw-mgmt-notice" role="status">{notice}</p>}
      <div className="bw-mgmt-review-desk">
        <ManagementQueue title="Pending submissions" count={items.length}>
          {queue.loading && <p role="status">Loading submissions…</p>}
          {!unavailable && !items.length && <p>No submissions are waiting for review.</p>}
          <ul>{items.map(item => (
            <ManagementQueueRow key={item.id} title={"@" + item.author.username}
              reference={"#" + item.id.slice(0, 8)} status={types[item.type]}
              meta={date.format(new Date(item.createdAt)) + " UTC"} selected={selected?.id === item.id}
              disabled={unavailable || Boolean(decision)} onClick={() => { setSelectedId(item.id); setNotice(""); }} />
          ))}</ul>
        </ManagementQueue>
        <section className="bw-mgmt-case-detail" aria-label="Selected post">
          {selected ? <article className="bw-mgmt-tool-card">
            <span className="bw-mgmt-card-eyebrow">PENDING REVIEW</span>
            <h2>{types[selected.type]} by @{selected.author.username}</h2>
            <p className="bw-mgmt-post-body">{selected.body}</p>
            {selected.tags.length > 0 && <ul className="bw-mgmt-post-tags" aria-label="Topic tags">
              {selected.tags.map(tag => <li className="bw-mgmt-tag" key={tag}>{tag}</li>)}
            </ul>}
            <div className="bw-mgmt-record-actions">
              <button type="button" className="bw-mgmt-primary" disabled={unavailable} onClick={() => start("PUBLISHED")}>Approve post</button>
              <button type="button" disabled={unavailable} onClick={() => start("REJECTED")}>Decline post</button>
            </div>
          </article> : <div className="bw-mgmt-review-placeholder"><h2>Select a submission</h2><p>Read the post and its topic tags before recording a decision.</p></div>}
        </section>
      </div>
      {decision && selected && <ManagementActionDialog
        title={decision.decision === "PUBLISHED" ? "Approve this post" : "Decline this post"}
        description={decision.decision === "PUBLISHED" ? "Your reason is recorded in the management audit log." : "The author will see your reason in My Posts. Explain what needs to change."}
        onClose={() => { setDecision(null); void queue.refresh(); }} onConfirm={confirm} />}
    </section>
  );
}

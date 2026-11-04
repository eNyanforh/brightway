import WorkspaceIcon from "../workspace/WorkspaceIcon";

// Counts and search cover only the server page already loaded, never the whole queue.
export function ManagementQueue({ title, count, children }) {
  return <section className="bw-mgmt-queue-panel" aria-label={title}>
    <header><div><p>INCOMING REQUESTS</p><h2>{title}</h2></div><span className="bw-mgmt-count">{count} loaded</span></header>
    {children}
  </section>;
}

export function ManagementQueueRow({ title, reference, status, meta, selected, disabled, onClick, icon = "shield" }) {
  return <li><button type="button" aria-label={`${title} ${reference} · ${status} · ${meta}`} aria-pressed={selected} disabled={disabled} onClick={onClick} className="bw-mgmt-queue-row">
    <span className="bw-mgmt-row-icon"><WorkspaceIcon name={icon} size={20} /></span>
    <span className="bw-mgmt-row-content"><strong>{title}</strong><span>{reference}</span><span className="bw-mgmt-row-meta">{meta}</span></span>
    <span className="bw-mgmt-row-end"><span className="bw-mgmt-status">{status}</span><WorkspaceIcon name="arrow" size={16} /></span>
  </button></li>;
}

export function ManagementReviewPlaceholder({ title = "A considered decision starts here", description = "Select a request to view its details, check the evidence and continue the review." }) {
  return <div className="bw-mgmt-review-placeholder"><span><WorkspaceIcon name="archive" size={35} /></span><p>YOUR REVIEW DESK</p><h2>{title}</h2><p>{description}</p><small>Assignment, permissions and MFA are checked before protected actions.</small></div>;
}

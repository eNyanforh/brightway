import WorkspaceIcon from "../workspace/WorkspaceIcon";

export default function ManagementPageHeader({ eyebrow = "REVIEW OPERATIONS", title, description, icon = "shield", action }) {
  return <header className="bw-mgmt-page-heading">
    <div className="bw-mgmt-page-heading-main">
      <span className="bw-mgmt-page-icon"><WorkspaceIcon name={icon} size={25} /></span>
      <div><p>{eyebrow}</p><h1>{title}</h1></div>
    </div>
    <p className="bw-mgmt-page-description">{description}</p>
    {action && <div className="bw-mgmt-page-action">{action}</div>}
  </header>;
}

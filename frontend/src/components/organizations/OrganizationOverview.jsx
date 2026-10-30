import { Link } from "react-router-dom";
import NavigationIcon from "../layout/NavigationIcon";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
import "./organization-dashboard.css";

const typeLabels = { SCHOOL: "School", NGO: "NGO", COMPANY: "Company" };
const toolCopy = {
  profile: { description: "Keep your organization’s identity, contact details and operating locations in one place.", action: "Open Profile", note: "Organization presence" },
  staff: { description: "Bring your team together. Invite staff and manage exactly what each person can access.", action: "Open Staff", note: "Team & permissions" },
  credentials: { description: "Review education or experience claims submitted to your organization as the issuer.", action: "Open Credential Review", note: "Issuer review" },
};

function ToolCard({ item }) {
  const copy = toolCopy[item.key];
  const content = <>
    <div className="bw-dashboard-tool-top"><span className={`bw-dashboard-tool-icon bw-dashboard-tool-icon-${item.key}`}><NavigationIcon name={item.icon} size={24} /></span><span className="bw-dashboard-tool-arrow"><WorkspaceIcon name="arrow" size={19} /></span></div>
    <span className="bw-dashboard-tool-category">{copy?.note || "Workspace tool"}</span>
    <h3>{item.label}</h3>
    <p>{copy?.description || item.description}</p>
    <span className="bw-dashboard-tool-bottom"><span>{copy?.action || `Open ${item.label}`}</span>{item.sensitive && <WorkspaceIcon name="shield" size={16} />}</span>
  </>;
  // One keyboard-accessible link per card, with the same scoped destination as navigation.
  const props = { className: "bw-dashboard-tool", "aria-label": copy?.action || `Open ${item.label}` };
  return item.external ? <a {...props} href={item.to} target="_blank" rel="noopener noreferrer">{content}</a> : <Link {...props} to={item.to}>{content}</Link>;
}

export default function OrganizationOverview({ workspace, organization, role }) {
  const tools = workspace.available.filter(item => item.key !== "dashboard");
  const administrator = role === "PRIMARY_ADMIN";
  const training = organization.type === "SCHOOL" || organization.offersTraining;
  return <div className="bw-dashboard" aria-label="Dashboard overview">
    <header className="bw-dashboard-welcome">
      <div><p className="bw-dashboard-eyebrow"><span aria-hidden="true" />YOUR ORGANIZATION, CONNECTED</p><h2>Dashboard</h2><p>Your organization’s tools, in one place.<br />Choose where you want to work today.</p></div>
      <span className="bw-dashboard-welcome-art" aria-hidden="true"><WorkspaceIcon name="building" size={56} /><span><WorkspaceIcon name="check" size={16} /></span></span>
    </header>
    <dl className="bw-dashboard-summary" aria-label="Workspace summary">
      <div><span className="bw-dashboard-summary-icon"><WorkspaceIcon name="building" size={20} /></span><div><dt>Organization type</dt><dd>{typeLabels[organization.type] || "Organization"}</dd></div></div>
      <div><span className="bw-dashboard-summary-icon"><WorkspaceIcon name="shield" size={20} /></span><div><dt>Your role</dt><dd>{administrator ? "Primary administrator" : "Staff member"}</dd></div></div>
      <div><span className="bw-dashboard-summary-icon"><NavigationIcon name="explore" size={20} /></span><div><dt>Available tools</dt><dd>{tools.length}<span> for your role</span></dd></div></div>
    </dl>
    <div className="bw-dashboard-layout">
      <section className="bw-dashboard-tools" aria-labelledby="dashboard-tools-title">
        <header className="bw-dashboard-section-heading"><div><h2 id="dashboard-tools-title">Your workspace tools</h2><p>Your tools, all in one place.</p></div><span className="bw-dashboard-count" aria-label={`${tools.length} available ${tools.length === 1 ? "tool" : "tools"}`}>{String(tools.length).padStart(2, "0")}</span></header>
        {tools.length ? <div className="bw-dashboard-tool-grid">{tools.map(item => <ToolCard key={item.key} item={item} />)}</div> : <div className="bw-dashboard-empty"><WorkspaceIcon name="shield" size={30} /><h3>No tools available yet</h3><p>Ask your organization administrator about your access, then refresh this workspace.</p></div>}
        <p className="bw-dashboard-scope-note"><WorkspaceIcon name="shield" size={16} />Only tools available to your current role appear here.</p>
      </section>
      <aside className="bw-dashboard-rail" aria-label="Workspace guidance">
        <section className="bw-dashboard-access" aria-labelledby="dashboard-access-title"><span className="bw-dashboard-panel-icon"><WorkspaceIcon name="shield" size={22} /></span><h2 id="dashboard-access-title">Your workspace access</h2><p>{administrator ? "You manage this organization. Give each teammate the access they need to do their work." : "Your administrator manages your permissions. The tools shown here reflect your current access."}</p><div className="bw-dashboard-access-note"><WorkspaceIcon name="shield" size={17} /><p>Sensitive actions require current permission and two-factor authentication.</p></div><Link to="/security">Account security<WorkspaceIcon name="arrow" size={16} /></Link></section>
        {training && !workspace.campusActive && <section className="bw-dashboard-campus" aria-labelledby="dashboard-campus-title"><div className="bw-dashboard-campus-heading"><WorkspaceIcon name="building" size={24} /><span>COMING SOON</span></div><h2 id="dashboard-campus-title">A home for learning.</h2><p>Bring your teaching, learners and school operations together with Virtual Campus.</p>{workspace.campusSetup && <Link to={workspace.campusSetup.to}>Explore Build Campus<WorkspaceIcon name="arrow" size={17} /></Link>}<small>Campus requires a qualifying verified Liberia operation and explicit activation. Organization approval and admission acceptance do not activate or bill Campus.</small></section>}
      </aside>
    </div>
  </div>;
}

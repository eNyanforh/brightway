import { Link } from "react-router-dom";
import WorkspaceIcon from "../workspace/WorkspaceIcon";
export default function CampusSetupOverview({ organization }) {
  return <section className="bw-campus-setup" aria-labelledby="campus-setup-heading">
    <span className="bw-campus-setup-icon"><WorkspaceIcon name="building" size={32} /></span>
    <p className="bw-org-eyebrow">VIRTUAL CAMPUS · COMING SOON</p>
    <h2 id="campus-setup-heading">Build Campus</h2>
    <p>A connected home for teaching, learners and school operations at <strong>{organization.name}</strong>.</p>
    <div className="bw-campus-setup-notice" role="status"><strong>Campus setup is not available yet.</strong><p>This is an overview of the requirements. Your organization has not been activated for Campus and no charges have been created.</p></div>
    <h3>Before your Campus can open</h3>
    <ul>
      <li>A qualifying verified operating location in Liberia.</li>
      <li>Authorized Campus administration and permissions.</li>
      <li>Completed Campus setup and explicit activation.</li>
    </ul>
    <p>Organization approval and admission acceptance do not activate Campus. Grade School and TVET have separate academic and registration workflows.</p>
    <Link className="bw-org-workspace-entry" to={`/organization-workspace/${organization.id}`}>Back to organization workspace</Link>
  </section>;
}

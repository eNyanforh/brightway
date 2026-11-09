import { Link } from "react-router-dom";
import Icon from "../layout/Icon";

const sources = [
  { kind: "experience", label: "Experience" },
  { kind: "education", label: "Education" },
];

export default function ProfileCredentials({ profile }) {
  const records = sources.flatMap(({ kind, label }) =>
    (Array.isArray(profile[kind]?.records) ? profile[kind].records : []).map(record => ({
      ...record, kind, label,
    })));
  const verified = records.filter(item => item.status === "VERIFIED");
  const pending = records.filter(item => ["SUBMITTED", "IN_REVIEW"].includes(item.status)).length;
  return (
    <section id="profile-credentials" className="bw-profile-card bw-profile-section bw-profile-credential-section"
      aria-labelledby="profile-credentials-title">
      <div className="bw-profile-section-head">
        <div>
          <h2 id="profile-credentials-title">Credentials & verification</h2>
          <p className="bw-profile-section-subtitle">A record of education and experience verified on BrightWay.</p>
        </div>
        <Link className="bw-profile-section-link" to="/credentials">Manage credentials</Link>
      </div>
      {verified.length > 0 ? (
        <ul className="bw-profile-verified-records">
          {verified.map(item => (
            <li key={item.kind + "-" + item.id}>
              <span className="bw-profile-verified-record-icon"><Icon name={item.kind === "experience" ? "briefcase" : "book"} /></span>
              <div>
                <small>{item.label} · Verified</small>
                <strong>{item.kind === "experience" ? item.role : item.qualification}</strong>
                <p>{item.kind === "experience" ? item.organization : item.institution}</p>
                <Link to={`/credentials/${item.kind}/${item.id}`}>View verification</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bw-profile-muted">No education or experience records have been verified yet.</p>
      )}
      {pending > 0 && (
        <p className="bw-profile-credential-pending">
          {pending} {pending === 1 ? "record is" : "records are"} awaiting a verification decision.
        </p>
      )}
      <p className="bw-profile-credential-note">
        Only verified records appear here. Certificates and licenses are not issued by this section.
      </p>
    </section>
  );
}

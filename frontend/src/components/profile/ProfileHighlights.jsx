import { Link } from "react-router-dom";
import Icon from "../layout/Icon";

/** Only summarize records the owner actually saved. Never infer affiliations. */
function leadingRecord(records) {
  if (!Array.isArray(records) || !records.length) return null;
  return [...records].sort((a, b) =>
    Number(Boolean(b.current)) - Number(Boolean(a.current)) ||
    String(b.startMonth || "").localeCompare(String(a.startMonth || "")))[0];
}

export default function ProfileHighlights({ profile }) {
  const experience = leadingRecord(profile.experience?.records);
  const education = leadingRecord(profile.education?.records);
  if (!experience && !education) return null;
  return (
    <div className="bw-profile-highlights" aria-label="Professional background">
      {experience && (
        <Link to="#profile-experience" className="bw-profile-highlight">
          <span className="bw-profile-highlight-icon"><Icon name="briefcase" /></span>
          <span>
            <small>Experience</small>
            <strong>{experience.organization || experience.role}</strong>
            {experience.organization && experience.role && <em>{experience.role}</em>}
          </span>
        </Link>
      )}
      {education && (
        <Link to="#profile-education" className="bw-profile-highlight">
          <span className="bw-profile-highlight-icon"><Icon name="book" /></span>
          <span>
            <small>Education</small>
            <strong>{education.institution || education.qualification}</strong>
            {education.institution && education.qualification && <em>{education.qualification}</em>}
          </span>
        </Link>
      )}
    </div>
  );
}

import { JOB_TYPES, JOB_COMPENSATION_TYPES, formatJobSalary } from "../../../../shared/opportunities.mjs";
import "./challenge-sidebar-card.css";

export default function JobDetailsSummary({ details, className = "" }) {
  if (!details) return null;
  const type = JOB_TYPES[details.type];
  const compensation = JOB_COMPENSATION_TYPES[details.compensationType];
  const salary = formatJobSalary(details);
  if (!type && !compensation && !salary) return null;
  return <div className={"bw-job-details-summary " + className} aria-label="Job type and compensation">
    {type && <span className="bw-job-detail-type">{type}</span>}
    {compensation && <span className="bw-job-detail-compensation">{compensation}</span>}
    {salary && <strong className="bw-job-detail-salary">{salary}</strong>}
  </div>;
}

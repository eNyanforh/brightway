import { JOB_TYPES } from "../../../../shared/opportunities.mjs";
import "./specialized-opportunity.css";

const money = (value, currency) => {
  if (value === null || value === undefined || !currency) return null;
  const symbol = { USD: "US$", LRD: "L$", EUR: "€", GBP: "£" }[currency] || currency + " ";
  return symbol + Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
};
const FUNDING = { FULL: "Fully funded", PARTIAL: "Partially funded", FIXED: "Fixed amount",
  TUITION_WAIVER: "Tuition waiver", STIPEND: "Stipend", OTHER: "Other funding" };
const labels = { NO_EXPERIENCE: "No experience required", ENTRY: "Entry level", JUNIOR: "Junior",
  MID: "Mid-level", SENIOR: "Senior", MANAGER: "Manager", EXECUTIVE: "Executive" };
function Lines({ heading, lines }) {
  const present = (lines || []).filter(Boolean);
  if (!present.length) return null;
  return <div className="bw-dedicated-detail-group"><h3>{heading}</h3><ul>{present.map((line, index) => <li key={index}>{line}</li>)}</ul></div>;
}
function Attribute({ label, value }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return null;
  return <div><dt>{label}</dt><dd>{Array.isArray(value) ? value.join(", ") : value}</dd></div>;
}
export function ScholarshipFundingSummary({ details, compact = false }) {
  if (!details) return null;
  const value = money(details.scholarshipValue, details.currency);
  return <div className={"bw-dedicated-funding" + (compact ? " is-compact" : "")}>
    {FUNDING[details.fundingType] && <span>{FUNDING[details.fundingType]}</span>}
    {value && <strong>{value}</strong>}
    {Array.isArray(details.academicLevels) && details.academicLevels.length > 0 &&
      <span>{details.academicLevels.slice(0, compact ? 2 : 6).join(" · ")}</span>}
  </div>;
}
export default function SpecializedOpportunityDetails({ opportunity }) {
  if (opportunity.type === "JOB" && opportunity.jobSpecification) {
    const d = opportunity.jobSpecification;
    return <section className="bw-op-surface bw-dedicated-detail">
      <h2>Job requirements & benefits</h2>
      <dl className="bw-dedicated-detail-attributes">
        <Attribute label="Category" value={d.category} />
        <Attribute label="Job type" value={JOB_TYPES[opportunity.jobDetails?.type]} />
        <Attribute label="Experience level" value={labels[d.experienceLevel]} />
        <Attribute label="Vacancies" value={d.vacancies} />
        <Attribute label="Education" value={d.minimumEducation} />
        <Attribute label="Experience" value={d.experienceMonths !== null ? d.experienceMonths + " months" : null} />
        <Attribute label="Required skills" value={d.requiredSkills} />
        <Attribute label="Preferred skills" value={d.preferredSkills} />
        <Attribute label="Certifications" value={d.certifications} />
        <Attribute label="Languages" value={d.languages} />
        <Attribute label="Benefits" value={d.benefits} />
        <Attribute label="Expected start" value={d.expectedStartDate} />
      </dl>
      <Lines heading="Responsibilities" lines={d.responsibilities} />
      <Lines heading="Required qualifications" lines={d.requiredQualifications} />
      <Lines heading="Preferred qualifications" lines={d.preferredQualifications} />
      <Lines heading="Recruitment stages" lines={d.recruitmentStages} />
    </section>;
  }
  if (opportunity.type === "SCHOLARSHIP" && opportunity.scholarshipSpecification) {
    const d = opportunity.scholarshipSpecification;
    return <section className="bw-op-surface bw-dedicated-detail">
      <h2>Scholarship funding & eligibility</h2>
      <ScholarshipFundingSummary details={d} />
      <dl className="bw-dedicated-detail-attributes">
        <Attribute label="Scholarship category" value={d.category} />
        <Attribute label="Scholarships available" value={d.awards} />
        <Attribute label="Academic levels" value={d.academicLevels} />
        <Attribute label="Fields of study" value={d.studyFields} />
        <Attribute label="Tuition coverage" value={d.tuitionCoverage === "CUSTOM" ? d.customTuitionPercent + "%" : d.tuitionCoverage === "NONE" ? "" : d.tuitionCoverage + "%"} />
        <Attribute label="Living allowance" value={money(d.livingAllowance, d.currency)} />
        <Attribute label="Other benefits" value={d.otherBenefits} />
        <Attribute label="Eligible countries" value={d.eligibleCountries} />
        <Attribute label="Minimum education" value={d.minimumEducation} />
        <Attribute label="Academic requirement" value={d.academicRequirement} />
        <Attribute label="Eligible study fields" value={d.eligibleStudyFields} />
        <Attribute label="Host institution" value={d.hostInstitution} />
        <Attribute label="Study country" value={d.studyCountry} />
        <Attribute label="Study region" value={d.studyRegion} />
        <Attribute label="Programs" value={d.programs} />
        <Attribute label="Intake" value={d.academicIntake} />
        <Attribute label="Minimum age" value={d.ageMin} />
        <Attribute label="Maximum age" value={d.ageMax} />
        <Attribute label="Language requirements" value={d.languages} />
        <Attribute label="Applications open" value={d.applicationsOpen} />
        <Attribute label="Expected results" value={d.announcementDate} />
      </dl>
      <div className="bw-dedicated-benefits">
        {d.accommodation && <span>Accommodation included</span>}
        {d.travelSupport && <span>Travel support</span>}
        {d.healthInsurance && <span>Health insurance</span>}
        {d.booksMaterials && <span>Books & materials</span>}
        {d.financialNeed && <span>Financial need considered</span>}
      </div>
      <Lines heading="Eligibility criteria" lines={d.eligibilityCriteria} />
      <div className="bw-dedicated-detail-group"><h3>Selection criteria</h3><p>{d.selectionCriteria}</p></div>
      <Lines heading="Selection process" lines={d.selectionStages} />
    </section>;
  }
  return null;
}

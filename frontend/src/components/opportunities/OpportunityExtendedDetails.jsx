import "./dedicated-opportunity-fields.css";
import { JOB_TYPES, JOB_COMPENSATION_TYPES, formatJobSalary } from "../../../../shared/opportunities.mjs";
import { requiredDocumentLabels } from "../../../../shared/opportunity-documents.mjs";

const human = value => String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const join = list => Array.isArray(list) ? list.filter(Boolean).map(human).join(", ") : "";
const money = (amount, code) => amount != null && code
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount) : "";

function Metadata({ rows }) {
  return <dl className="bw-op-dedicated-metadata">{rows.filter(([,value])=>value !== "" && value != null).map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function List({ heading, items }) {
  return Array.isArray(items) && items.filter(Boolean).length > 0
    ? <div><h3>{heading}</h3><ul>{items.filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null;
}
export function scholarshipSummary(details) {
  if (!details) return null;
  const category = details.fundingType ? human(details.fundingType) : null;
  const amount = money(details.value, details.currency);
  return [category, amount].filter(Boolean).join(" · ") || null;
}
export default function OpportunityExtendedDetails({ opportunity }) {
  if (!["JOB", "SCHOLARSHIP"].includes(opportunity.type)) return null;
  const d = opportunity.details || {};
  const documents = requiredDocumentLabels(opportunity.type, d);
  if (opportunity.type === "JOB") return <section className="bw-op-surface bw-op-extended-details">
    <h2>Job details and requirements</h2>
    <Metadata rows={[
      ["Job category", d.category], ["Job type", JOB_TYPES[opportunity.jobDetails?.type]],
      ["Compensation", JOB_COMPENSATION_TYPES[opportunity.jobDetails?.compensationType]],
      ["Salary", formatJobSalary(opportunity.jobDetails)],
      ["Experience level", d.experienceLevel ? human(d.experienceLevel) : null],
      ["Vacancies", d.vacancies], ["Minimum education", d.education && human(d.education)],
      ["Minimum experience", d.experienceMonths != null ? d.experienceMonths + " months" : null],
      ["Expected start", d.startDate], ["Country", d.country], ["County/State", d.region], ["City", d.city],
      ["Work address", d.address], ["Hiring date", d.hiringDate],
    ]}/>
    <List heading="Responsibilities" items={d.responsibilities}/>
    <List heading="Required qualifications" items={d.requiredQualifications}/>
    <List heading="Preferred qualifications" items={d.preferredQualifications}/>
    <List heading="Required skills" items={d.requiredSkills}/>
    <List heading="Preferred skills" items={d.preferredSkills}/>
    <List heading="Fields of study" items={d.fieldsOfStudy}/>
    <List heading="Certifications" items={d.certifications}/>
    <List heading="Languages" items={d.languages}/>
    <List heading="Benefits" items={d.benefits}/>
    <List heading="Recruitment stages" items={(d.recruitmentStages || []).map(human)}/>
    <List heading="Required application documents" items={documents}/>
  </section>;
  return <section className="bw-op-surface bw-op-extended-details">
    <h2>Scholarship funding and eligibility</h2>
    <Metadata rows={[
      ["Scholarship category", d.category && human(d.category)],
      ["Funding type", d.fundingType && human(d.fundingType)],
      ["Value", money(d.value, d.currency)],
      ["Tuition coverage", d.tuitionPercent != null ? d.tuitionPercent + "%" : null],
      ["Funding duration", d.fundingMonths != null ? d.fundingMonths + " months" : null],
      ["Number of awards", d.awardsAvailable], ["Academic levels", join(d.academicLevels)],
      ["Host institution", d.institution], ["Study country", d.studyCountry],
      ["Study location", d.studyRegion], ["Program duration", d.programMonths != null ? d.programMonths + " months" : null],
      ["Academic intake", d.intake], ["Eligible countries", join(d.eligibleCountries)],
      ["Minimum education", d.education && human(d.education)],
      ["Minimum age", d.minAge], ["Maximum age", d.maxAge],
      ["Academic performance", d.academicPerformance],
      ["Required experience", d.experienceMonths != null ? d.experienceMonths + " months" : null],
      ["Applications open", d.openingDate], ["Results expected", d.announcementDate],
    ]}/>
    <List heading="Fields of study" items={d.fieldsOfStudy}/>
    <List heading="Programs" items={d.programs}/>
    <List heading="Eligibility criteria" items={d.eligibilityCriteria}/>
    <List heading="Language requirements" items={d.languages}/>
    <List heading="Selection criteria" items={d.selectionCriteria}/>
    <List heading="Selection stages" items={(d.selectionStages || []).map(human)}/>
    <List heading="Other benefits" items={[
      ...(d.livingAllowance ? ["Living allowance" + (money(d.livingAllowanceAmount, d.currency) ? " (" + money(d.livingAllowanceAmount, d.currency) + ")" : "")] : []),
      ...(d.accommodation ? ["Accommodation"] : []),
      ...(d.travelSupport ? ["Travel support"] : []),
      ...(d.healthInsurance ? ["Health insurance"] : []),
      ...(d.learningMaterials ? ["Books and learning materials"] : []),
      ...(d.benefits || []),
    ]}/>
    <List heading="Required application documents" items={documents}/>
  </section>;
}

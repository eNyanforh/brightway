import { countryName } from "./countries";
import { Link } from "react-router-dom";
import VerificationBadge from "../VerificationBadge";
import { PROGRAM_TYPES, STUDY_MODES } from "../../../../shared/learning.mjs";
export default function ProgramCard({ program }) {
  return <article className="bw-learn-card"><div className="bw-learn-card-top"><span>{PROGRAM_TYPES[program.type]}</span><span>{STUDY_MODES[program.studyMode]}</span></div><p className="bw-op-provider">{program.organization.name} <VerificationBadge kind="organization" /></p><h3><Link to={`/learning/programs/${program.id}`}>{program.title}</Link></h3><p className="bw-learn-summary">{program.description}</p><div className="bw-learn-details"><span>{program.field}</span><span>{program.duration}</span><span>{program.location}, {countryName(program.countryCode)}</span></div><Link className="bw-learn-link" to={`/learning/programs/${program.id}`}>Explore program →</Link></article>;
}

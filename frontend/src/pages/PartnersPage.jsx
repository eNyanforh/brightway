import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import Icon from "../components/layout/Icon";
import MarketingVisual from "../components/layout/MarketingVisual";
import "./home.css";

const partnerships = [
  { icon: "briefcase", title: "Companies & employers", text: "Help shape pathways from learning to work, and connect future talent with meaningful opportunities." },
  { icon: "sprout", title: "NGOs & foundations", text: "Support skills development, community initiatives and access to opportunity." },
  { icon: "book", title: "Training organizations", text: "Bring practical learning and development closer to individuals and school communities." },
];
export default function PartnersPage() {
  const { account } = useAuth();
  return <div className="bw-home bw-partners-page">
    <section className="bw-home-hero bw-hero-partners" aria-labelledby="partners-title"><div className="bw-marketing-container bw-hero-inner">
      <div className="bw-hero-copy"><p className="bw-public-eyebrow">BRIGHTWAY FOR ORGANIZATIONS</p><h1 id="partners-title">Shared purpose.<br /><span>Brighter futures.</span></h1><p className="bw-home-intro">People have potential. Organizations can help open doors. Our partnership vision brings those two things together through learning, opportunity and community.</p><a className="bw-public-button bw-public-button-large" href="#partnerships">Explore partnership possibilities <span aria-hidden="true">↓</span></a><p className="bw-hero-note">Partnership tools are in development.</p></div>
      <MarketingVisual kind="partners" />
    </div></section>
    <section className="bw-marketing-container bw-partnership-section" id="partnerships" aria-labelledby="partnerships-heading"><div className="bw-marketing-heading"><div><p className="bw-public-eyebrow">A PLACE FOR ORGANIZATIONS WITH PURPOSE</p><h2 id="partnerships-heading">Help potential go further.</h2></div><span className="bw-roadmap-badge">Planned partnerships</span></div><p className="bw-section-intro">We’re building towards collaboration with organizations that want to make learning and opportunity more accessible. These are potential areas of partnership, not services available today.</p><div className="bw-marketing-cards">{partnerships.map((item, index) => <article key={item.title}><span className="bw-card-number">0{index + 1}</span><Icon name={item.icon} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>
    <section className="bw-partner-next" id="partner-next" aria-labelledby="partner-next-title"><div className="bw-marketing-container bw-feature-section"><div className="bw-feature-copy"><p className="bw-public-eyebrow">WHERE TO BEGIN</p><h2 id="partner-next-title">An organization.<br />A human connection.</h2><p>Organizations will be managed through the people who represent them, using their personal BrightWay accounts. Organization creation, partnership applications and review are not yet open.</p><Link className="bw-public-button" to={account ? "/profile" : "/register"}>{account ? "Go to your personal profile" : "Create a personal account"} <span aria-hidden="true">↗</span></Link></div><div className="bw-partner-note"><Icon name="users" /><h3>Here for your school?</h3><p>Schools have their own homepage view, focused on students, teachers and school life.</p><Link className="bw-home-text-link" to="/?audience=schools">Explore BrightWay for schools <span aria-hidden="true">↗</span></Link></div></div></section>
  </div>;
}
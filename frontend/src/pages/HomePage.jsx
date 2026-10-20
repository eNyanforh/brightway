import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import Icon from "../components/layout/Icon";
import MarketingVisual from "../components/layout/MarketingVisual";
import "./home.css";

const individualFuture = [
  { icon: "users", title: "Find your community.", text: "Join a network of learners, mentors, employers, and schools." },
  { icon: "briefcase", title: "Find your next opportunity.", text: "Find the best internships, scholarships, and job placements." },
  { icon: "book", title: "Keep on learning.", text: "Learn the skills that matter, gain practical experience, and unlock your potential." },
];
const schoolFuture = [
  { icon: "pencil", title: "Simpler administration.", text: "Manage your students, lessons, and instructors with ease" },
  { icon: "book", title: "A clearer learning journey.", text: "Build direct, trusted relationships with students and graduates." },
  { icon: "users", title: "A connected community.", text: "Join a network of learners, mentors, employers, and schools." },
];

export default function HomePage() {
  const [params] = useSearchParams();
  const schools = params.get("audience") === "schools";
  const { account } = useAuth();
  const join = account ? "/explore" : "/register";
  return (
    <div className="bw-home" data-audience={schools ? "schools" : "individuals"}>
      <section className={`bw-home-hero ${schools ? "bw-hero-schools" : ""}`} aria-labelledby="home-title">
        <div className="bw-marketing-container bw-hero-inner">
          <div className="bw-hero-copy">
            <p className="bw-public-eyebrow">{schools ? "Brightway for schools" : "Welcome to Brightway"}</p>
            <h1 id="home-title">{schools ? "Connect with learners globally, empower their growth, and transform potential into results." : "The all-in-one ecosystem for learning, connection, career growth, and opportunities."}</h1>
            <p className="bw-home-intro">{schools
              ? "Your students. Your teachers. Your school community. Our vision is to bring them together, so schools can spend more time helping every learner grow."
              : "You’re more than your grades or your job title. Bring your skills, interests and ambitions together, and take the next step towards who you want to become."}</p>
            <div className="bw-home-actions">
              {schools ? <a className="bw-public-button bw-public-button-large" href="#school-vision">Explore the school vision <span aria-hidden="true">↗</span></a>
                : <Link className="bw-public-button bw-public-button-large" to={join}>{account ? "Open BrightWay" : "Join for free"} <span aria-hidden="true">↗</span></Link>}
              <a className="bw-home-text-link" href="#how-it-works">How it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="bw-hero-note">{schools ? "School tools are in development." : "Not just social. Purposeful."}</p>
          </div>
          <MarketingVisual kind={schools ? "school" : "profile"} />
        </div>
      </section>

      <section className="bw-marketing-container bw-feature-section" id="why-brightway" aria-labelledby="purpose-title">
        <div className="bw-feature-copy">
          <p className="bw-public-eyebrow">{schools ? "PUT YOUR SCHOOL COMMUNITY FIRST" : "LET THE WORLD SEE MORE OF YOU"}</p>
          <h2 id="purpose-title">{schools ? <>More time for learning.<br />Less getting in the way.</> : <>Build a profile.<br />Show your potential.</>}</h2>
          <p>{schools
            ? "Running a school means keeping people, learning and information moving together. BrightWay’s school offering is being designed around that everyday reality."
            : "Tell your story through your education, experience, skills and interests. Whether you’re a student, starting your career or finding a new direction, there’s room for you here."}</p>
          {schools ? <a className="bw-home-text-link" href="#school-vision">See what we’re building <span aria-hidden="true">↗</span></a>
            : <Link className="bw-public-button" to={account ? "/profile" : "/register"}>Build your profile <span aria-hidden="true">↗</span></Link>}
        </div>
        <div className="bw-purpose-board">
          <span className="bw-board-label">{schools ? "ONE SCHOOL. A SHARED JOURNEY." : "YOUR STORY HAS MANY SIDES."}</span>
          {(schools ? [["book", "Students", "Every learner matters."], ["pencil", "Teachers", "Support the people who teach."], ["users", "Guardians", "Keep families part of the journey."]]
            : [["sprout", "Your skills", "What you can do."], ["book", "Your experience", "What you’ve learned along the way."], ["compass", "Your interests", "What makes you curious."]]).map(([icon, title, text]) => <div key={title}><Icon name={icon} /><p><strong>{title}</strong><span>{text}</span></p><span aria-hidden="true">↗</span></div>)}
        </div>
      </section>

      <section className="bw-vision-section" id={schools ? "school-vision" : "possibilities"} aria-labelledby="vision-title">
        <div className="bw-marketing-container">
          <div className="bw-marketing-heading"><div><p className="bw-public-eyebrow">{schools ? "THE SCHOOL VISION" : "MORE WAYS TO MOVE FORWARD"}</p><h2 id="vision-title">{schools ? "Built around school life." : "Learn. Connect. Find your way."}</h2></div><span className="bw-roadmap-badge">{schools ? "In development" : "Coming next"}</span></div>
          <p className="bw-section-intro">{schools ? "These school features are planned and are not yet available. Explore the direction we’re building towards." : "Your profile is the beginning. Learning, networking and opportunities are the next parts of the BrightWay journey."}</p>
          <div className="bw-marketing-cards">{(schools ? schoolFuture : individualFuture).map((item, index) => <article key={item.title}><span className="bw-card-number">0{index + 1}</span><Icon name={item.icon} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
        </div>
      </section>

      <section className="bw-marketing-container bw-how-section" id="how-it-works" aria-labelledby="steps-title">
        <div><p className="bw-public-eyebrow">{schools ? "A SCHOOL STARTS WITH PEOPLE" : "START WHERE YOU ARE"}</p><h2 id="steps-title">{schools ? "One person. One account.\nA school community ahead." : "Small steps.\nYour own pace."}</h2><p>{schools ? "School access will build on personal BrightWay accounts. Creating an account today does not register or activate a school." : "Start with your account and build a profile that reflects you. You can save each section and return when you’re ready."}</p></div>
        <ol className="bw-how-list">{(schools ? [
          ["Create your personal account.", "Use your own BrightWay account as the starting point."],
          ["Build your personal profile.", "Keep your identity separate from any future school role."],
          ["School setup comes next.", "School requests and campus activation are planned for a later release."],
        ] : [
          ["Make your introduction.", "Create an account with your email, personal details, password and profile photo."],
          ["Bring your story together.", "Add your skills, interests, education and experience."],
          ["Choose what you share.", "Set who can see each contact field and update your profile as you grow."],
        ]).map(([title, text], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
      </section>

      {schools && <div className="bw-school-partnership-cta"><p>Interested in partnering with us?</p><Link className="bw-public-button" to="/partners#partner-next">Build Online Campus</Link></div>}

      <section className="bw-marketing-final"><div className="bw-marketing-container"><div><p className="bw-public-eyebrow">{schools ? "FOR THE PEOPLE BEHIND EVERY SCHOOL" : "YOUR NEXT CHAPTER STARTS WITH YOU"}</p><h2>{schools ? "Start with you.\nGrow together." : "Make room for\nwhat comes next."}</h2></div><Link className="bw-public-button bw-public-button-light bw-public-button-large" to={join}>{account ? "Open BrightWay" : schools ? "Create a personal account" : "Join BrightWay"} <span aria-hidden="true">↗</span></Link></div></section>
    </div>
  );
}
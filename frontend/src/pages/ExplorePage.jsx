import { lazy, Suspense, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import ExploreBillboard from "../components/discovery/ExploreBillboard";
import PostsPanel from "../components/posts/PostsPanel";
import NavigationIcon from "../components/layout/NavigationIcon";
import "../components/discovery/people-suggestions.css";
import "./explore.css";

const PeopleSuggestions = lazy(() => import("../components/discovery/PeopleSuggestions"));
const OpportunityBrowser = lazy(() => import("../components/opportunities/OpportunityBrowser"));
const LearningResults = lazy(() => import("./LearningPage").then(m => ({ default: m.LearningResults })));
const views = [["for-you", "For You"], ["following", "Following"], ["saved", "Saved"]];

export default function ExplorePage() {
  const { account } = useAuth();
  const outlet = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();
  const composePostOnOpen = new URLSearchParams(location.search).get("compose") === "post";
  const [mobilePostNotice, setMobilePostNotice] = useState("");
  const finishMobileCompose = (message = "") => {
    setMobilePostNotice(message);
    if (!composePostOnOpen) return;
    const params = new URLSearchParams(location.search);
    params.delete("compose");
    navigate({ pathname: location.pathname, search: params.toString() ? "?" + params : "", hash: location.hash }, { replace: true });
  };
  const [view, setView] = useState("for-you");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  return (
    <section className="bw-explore" aria-label="Explore">
      <div className="bw-explore-main">
        <h1 className="bw-explore-sr-only">Explore community</h1>

        <ExploreBillboard />

        <section className="bw-explore-timeline" aria-label="Community feed">
          <nav className="bw-explore-filters" aria-label="Explore feed">
            {views.map(([key, label]) => (
              <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          {mobilePostNotice && <p role="status" className="bw-explore-mobile-post-notice">{mobilePostNotice}</p>}
          <PostsPanel key={account.id + ":" + view + ":" + (composePostOnOpen ? location.key : "feed")} view={view} timeline
            composerAccount={account} showInlineComposer={view === "for-you"}
            composePostOnOpen={composePostOnOpen} onComposeRequestFinished={finishMobileCompose}
            composerPhotoId={outlet?.profileDraft?.profile.photo?.id} />
        </section>
      </div>

      <aside className="bw-explore-right" aria-label="Explore sidebar">
        <section className="bw-explore-aside-card bw-explore-challenges"><h2>Challenges</h2><Suspense fallback={<p role="status">Loading challenges…</p>}><OpportunityBrowser key={`${account.id}:${view}`} type="CHALLENGE" compact following={view === "following"} /></Suspense><Link className="bw-explore-aside-link" to="/opportunities?type=CHALLENGE">Browse challenges →</Link></section>
        <section className="bw-explore-aside-card">
          <div className="bw-explore-aside-title-row">
            <span className="bw-explore-aside-icon"><NavigationIcon name="network" size={20} /></span>
            <h2>Grow your network</h2>
          </div>
          <details className="bw-suggestions" open={suggestionsOpen}
            onToggle={event => setSuggestionsOpen(event.currentTarget.open)}>
            <summary><span>Suggested people</span><span className="bw-suggestions-chevron" aria-hidden="true">⌄</span></summary>
            {suggestionsOpen && (
              <Suspense fallback={<p role="status">Opening suggestions…</p>}>
                <PeopleSuggestions key={account.id} />
              </Suspense>
            )}
          </details>
          <Link className="bw-explore-aside-link" to="/search">
            Browse people <NavigationIcon name="search" size={16} />
          </Link>
        </section>

        <section className="bw-explore-aside-card"><h2>Discover programs</h2><Suspense fallback={<p role="status">Loading programs…</p>}><LearningResults key={`${account.id}:${view}`} compact filters={{ kind: "programs", ...(view === "following" ? { following: "true" } : {}) }} /></Suspense><Link className="bw-explore-aside-link" to="/learning">Explore education & training →</Link></section>
        <section className="bw-explore-aside-card bw-explore-journey">
          
          <span className="bw-explore-journey-icon"><NavigationIcon name="awards" size={23} /></span>
          <h2>Your posts</h2>
          <Link className="bw-explore-aside-link" to="/posts">
            View my posts <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </aside>
    </section>
  );
}

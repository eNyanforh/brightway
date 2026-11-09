import { lazy, Suspense, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import ExploreBillboard from "../components/discovery/ExploreBillboard";
import PostsPanel from "../components/posts/PostsPanel";
import NavigationIcon from "../components/layout/NavigationIcon";
import "../components/discovery/people-suggestions.css";
import "./explore.css";

const PeopleSuggestions = lazy(() => import("../components/discovery/PeopleSuggestions"));
const views = [["for-you", "For You"], ["following", "Following"], ["saved", "Saved"]];

export default function ExplorePage() {
  const { account } = useAuth();
  const outlet = useOutletContext();
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
          <PostsPanel key={account.id + ":" + view} view={view} timeline
            composerAccount={view === "for-you" ? account : null}
            composerPhotoId={outlet?.profileDraft?.profile.photo?.id} />
        </section>
      </div>

      <aside className="bw-explore-right" aria-label="Explore sidebar">
        <section className="bw-explore-aside-card">
          <div className="bw-explore-aside-title-row">
            <span className="bw-explore-aside-icon"><NavigationIcon name="network" size={20} /></span>
            <div>
              <p className="bw-explore-section-eyebrow">CONNECT</p>
              <h2>Grow your network</h2>
            </div>
          </div>
          <p className="bw-explore-aside-description">Meet people who share your interests, skills, and ambitions.</p>
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

        <section className="bw-explore-aside-card bw-explore-journey">
          <p className="bw-explore-section-eyebrow">YOUR JOURNEY</p>
          <span className="bw-explore-journey-icon"><NavigationIcon name="awards" size={23} /></span>
          <h2>Progress worth sharing.</h2>
          <p>Projects, achievements, and events can inspire someone taking their next step.</p>
          <Link className="bw-explore-aside-link" to="/posts">
            View my posts <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </aside>
    </section>
  );
}

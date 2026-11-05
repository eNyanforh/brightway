import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import PostsPanel from "../components/posts/PostsPanel";

export default function ExplorePage() {
  const { account } = useAuth();
  const [view, setView] = useState("for-you");

  return (
    <section className="bw-explore-posts">
      <header className="bw-explore-heading">
        <p>BRIGHTWAY DISCOVERY</p>
        <h1>Explore</h1>
        <p>See recent updates from verified organizations.</p>
      </header>
      <nav className="bw-explore-filters" aria-label="Explore feed">
        <button type="button" aria-pressed={view === "for-you"} onClick={() => setView("for-you")}>For You</button>
        <button type="button" aria-pressed={view === "following"} onClick={() => setView("following")}>Following</button>
      </nav>
      <PostsPanel key={account.id + ":" + view} view={view} />
    </section>
  );
}

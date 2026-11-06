import { useState } from "react";
import { Link } from "react-router-dom";
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
        <p>See recent updates from verified members and organizations.</p>
        <Link className="bw-explore-create" to="/posts">Create a post</Link>
      </header>
      <nav className="bw-explore-filters" aria-label="Explore feed">
        <button type="button" aria-pressed={view === "for-you"} onClick={() => setView("for-you")}>For You</button>
        <button type="button" aria-pressed={view === "following"} onClick={() => setView("following")}>Following</button>
        <button type="button" aria-pressed={view === "saved"} onClick={() => setView("saved")}>Saved</button>
      </nav>
      <PostsPanel key={account.id + ":" + view} view={view} />
    </section>
  );
}

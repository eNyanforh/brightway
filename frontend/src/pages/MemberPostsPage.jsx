import { Link, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import PostsPanel from "../components/posts/PostsPanel";

export default function MemberPostsPage() {
  const { account } = useAuth();
  const outlet = useOutletContext();
  return (
    <section className="bw-explore-posts">
      <header className="bw-explore-heading">
        <Link to="/explore">Back to Explore</Link>
        <h1>My posts</h1>
        <p>Submit an achievement, event, or question and track approval and feedback here.</p>
      </header>
      <PostsPanel key={account.id} personal composerAccount={account} composerPhotoId={outlet?.profileDraft?.profile.photo?.id} />
    </section>
  );
}

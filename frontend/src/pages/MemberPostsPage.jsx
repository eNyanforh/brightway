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
        <p>Share a learning or career update with the BrightWay community.</p>
      </header>
      <PostsPanel key={account.id} personal composerAccount={account} composerPhotoId={outlet?.profileDraft?.profile.photo?.id} />
    </section>
  );
}

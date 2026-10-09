
import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <main>
      <h1>404 — Page Not Found</h1>
      <p>The page you requested does not exist.</p>

      <Link to="/">Return Home</Link>
    </main>
  );
}

export default NotFoundPage;

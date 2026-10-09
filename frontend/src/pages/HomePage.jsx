
import { Link } from "react-router-dom";

/**
 * Temporary BrightWay landing page.
 * The final design will come later.
 */
function HomePage() {
  return (
    <main>
      <h1>Welcome to BrightWay</h1>
      <p>Empower. Learn. Network. Earn.</p>

      <nav aria-label="Account navigation">
        <Link to="/login">Login</Link>
        {" | "}
        <Link to="/register">Create Account</Link>
      </nav>
    </main>
  );
}

export default HomePage;

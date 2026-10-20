import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import PublicHeader from "../components/layout/PublicHeader";
import "./public-layout.css";

export default function PublicLayout() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: "start" });
    else document.scrollingElement?.scrollTo?.(0, 0);
  }, [pathname, search, hash]);
  return (
    <div className="bw-public-shell">
      <a className="bw-public-skip" href="#public-content">Skip to content</a>
      <PublicHeader />
      <main id="public-content" className={`bw-public-main ${(pathname === "/" || pathname === "/partners") ? "bw-public-home" : "bw-public-account"}`} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="bw-public-footer">
        <div className="bw-footer-inner">
          <div className="bw-footer-brand"><Link to="/">BrightWay<span>.</span></Link><p>Not just social.<br />Purposeful.</p></div>
          <nav aria-label="Footer navigation">
            <div><strong>Find your way</strong><Link to="/">For individuals</Link><Link to="/?audience=schools">For schools</Link><Link to="/partners">Partners</Link></div>
            <div><strong>Your BrightWay</strong><Link to="/login">Log in</Link><Link to="/register">Create an account</Link><Link to="/">About BrightWay</Link></div>
          </nav>
        </div>
        <div className="bw-footer-bottom">© {new Date().getFullYear()} BrightWay. <span>Empower. Learn. Network. Earn.</span></div>
      </footer>
    </div>
  );
}
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";

export default function PublicHeader() {
  const { account } = useAuth();
  const { pathname, search } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const schools = pathname === "/" && new URLSearchParams(search).get("audience") === "schools";
  const items = [
    { label: "For Individuals", to: "/", active: pathname === "/" && !schools },
    { label: "For Schools", to: "/?audience=schools", active: schools },
    { label: "For Companies", to: "/partners", active: pathname === "/partners" },
  ];
  const closeMenu = () => setMenuOpen(false);
  const authLinks = <>{account
    ? <Link className="bw-reference-button bw-reference-primary" to="/explore" onClick={closeMenu}>Open BrightWay</Link>
    : <><Link className="bw-reference-button" to="/login" onClick={closeMenu}>Login</Link><Link className="bw-reference-button bw-reference-primary" to="/register" onClick={closeMenu}>Join for free</Link></>}
  </>;
  return (
    <header className="bw-reference-header" onKeyDown={(event) => {
      if (event.key === "Escape") { closeMenu(); event.currentTarget.querySelector("button")?.focus(); }
    }}>
      <div className="bw-reference-navbar">
        <Link to="/" className="bw-reference-brand" aria-label="BrightWay home" onClick={closeMenu}>
          <img src={`${import.meta.env.BASE_URL}images/reference/brightway-logo.png`} width="45" height="45" alt="" />
          <span>BRIGHTWAY</span>
        </Link>
        <nav className="bw-reference-audiences" aria-label="Choose your audience">
          {items.map((item) => <Link key={item.to} to={item.to} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}
        </nav>
        <nav className="bw-reference-auth" aria-label="Public navigation">{authLinks}</nav>
        <button type="button" className="bw-reference-menu-button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen} aria-controls="bw-reference-mobile-menu" onClick={() => setMenuOpen((value) => !value)}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {menuOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </div>
      <nav id="bw-reference-mobile-menu" className="bw-reference-mobile-menu" aria-label="Mobile public navigation" hidden={!menuOpen}>
        {items.map((item) => <Link key={item.to} to={item.to} aria-current={item.active ? "page" : undefined} onClick={closeMenu}>{item.label}</Link>)}
        <div className="bw-reference-mobile-auth">{authLinks}</div>
      </nav>
    </header>
  );
}

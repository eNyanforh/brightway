import { Link, useLocation } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./module-right-rail.css";

const destinations = [
  { label: "People", icon: "network", kind: "people" },
  { label: "Organizations", icon: "work", kind: "organizations" },
  { label: "Achievements", icon: "awards", kind: "achievements" },
  { label: "Questions", icon: "question", kind: "questions" },
  { label: "Events", icon: "calendar", kind: "events" },
  { label: "Opportunities", icon: "opportunities", kind: "opportunities" },
  { label: "Programs", icon: "learning", kind: "programs" },
];

const contexts = [
  { prefix: "/messages", icon: "messages", title: "Connect with people", shortcuts: ["people", "opportunities"] },
  { prefix: "/network", icon: "network", title: "Connect with people", shortcuts: ["people", "organizations"] },
  { prefix: "/opportunities", icon: "opportunities", title: "More opportunities", shortcuts: ["opportunities", "organizations"] },
  { prefix: "/learning", icon: "learning", title: "Explore learning", shortcuts: ["programs", "organizations"] },
  { prefix: "/profile", icon: "network", title: "Find connections", shortcuts: ["people", "achievements"] },
  { prefix: "/posts", icon: "awards", title: "Community activity", shortcuts: ["achievements", "questions", "events"] },
  { prefix: "/notifications", icon: "notifications", title: "Discover what's new", shortcuts: ["people", "events"] },
];

export default function ModuleRightRail() {
  const { pathname, search } = useLocation();
  const q = pathname === "/search" ? (new URLSearchParams(search).get("q") || "").trim() : "";
  const isSearch = pathname === "/search";
  const context = contexts.find(item => pathname === item.prefix || pathname.startsWith(item.prefix + "/"));
  const title = isSearch ? "Browse categories" : context?.title || "Discover";
  const categoryOptions = isSearch ? destinations : destinations.filter(item => (context?.shortcuts || ["people", "opportunities", "programs"]).includes(item.kind));
  const searchLink = kind => "/search?" + new URLSearchParams({ ...(q ? { q } : {}), kind });

  return (
    <aside className="bw-module-right" aria-label={isSearch ? "Search discovery sidebar" : "Discovery sidebar"}>
      <section className="bw-module-right-card">
        <div className="bw-module-right-heading">
          <span className="bw-module-right-mark"><NavigationIcon name={isSearch ? "search" : context?.icon || "explore"} size={20} /></span>
          <h2>{title}</h2>
        </div>
        <nav className="bw-module-right-links" aria-label="Discover categories">
          {categoryOptions.map(item => (
            <Link key={item.kind} to={searchLink(item.kind)}>
              <NavigationIcon name={item.icon} size={17} />
              <span>{item.label}</span>
              <NavigationIcon name="chevron-right" size={15} />
            </Link>
          ))}
        </nav>
      </section>
      <section className="bw-module-right-card bw-module-right-next">
        <h2>Community</h2>
        <Link to="/explore" className="bw-module-right-action">Explore community <NavigationIcon name="chevron-right" size={17} /></Link>
      </section>
    </aside>
  );
}

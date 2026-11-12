import { Link, NavLink } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./mobile-navigation.css";

const items = [
  { label: "Explore", to: "/explore", icon: "explore" },
  {
    label: "Opportunities",
    to: "/opportunities",
    icon: "opportunities",
  },
  { label: "Network", to: "/network", icon: "network" },
  { label: "Learning", to: "/learning", icon: "learning" },
];

function Content({ item, active = false }) {
  return (
    <>
      <span className="bw-mobile-navigation-icon">
        <NavigationIcon name={item.icon} active={active} />
      </span>

      <span className="bw-mobile-navigation-label">
        {item.label}
      </span>
    </>
  );
}

export default function MobileNavigation({ onNavigate }) {
  return (
    <nav
      className="bw-mobile-navigation"
      aria-label="Mobile navigation"
    >
      {items.map(item => (
        <NavLink key={item.label} to={item.to} onClick={onNavigate}
>
          {({ isActive }) => <Content item={item} active={isActive} />}
        </NavLink>
      ))}
      <Link className="bw-mobile-compose-fab" to="/explore?compose=post"
        onClick={onNavigate} aria-label="Create Post">
        <NavigationIcon name="post" size={24} />
        <span>Post</span>
      </Link>
    </nav>
  );
}
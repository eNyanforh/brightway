import { Link, NavLink } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./mobile-navigation.css";

const destinations = [
  ["Explore", "/explore", "explore"],
  ["Opportunities", "/opportunities", "opportunities"],
  ["Post", "/explore?compose=post", "post"],
  ["Network", "/network", "network"],
  ["Learning", "/learning", "learning"],
];

function Content({ label, icon, active }) {
  return <>
    <span className="bw-mobile-navigation-icon"><NavigationIcon name={icon} active={active} /></span>
    <span className="bw-mobile-navigation-label">{label}</span>
  </>;
}

export default function MobileNavigation({ onNavigate }) {
  return <nav className="bw-mobile-navigation" aria-label="Mobile navigation">
    {destinations.map(([label, to, icon]) => icon === "post"
      ? <Link data-compose-shortcut key={to} to={to} aria-label="Create Post" onClick={onNavigate}>
          <Content label={label} icon={icon} />
        </Link>
      : <NavLink key={to} to={to} onClick={onNavigate}>
          {({ isActive }) => <Content label={label} icon={icon} active={isActive} />}
        </NavLink>)}
  </nav>;
}

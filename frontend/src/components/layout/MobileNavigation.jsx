import { NavLink } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./mobile-navigation.css";

const items = [
  { label: "Explore", to: "/explore", icon: "explore" },
  {
    label: "Opportunities",
    to: "/opportunities",
    icon: "opportunities",
  },
  { label: "Post", to: "/posts", icon: "post" },
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
          className={item.icon === "post" ? "bw-mobile-navigation-post" : undefined}>
          {({ isActive }) => <Content item={item} active={isActive} />}
        </NavLink>
      ))}
    </nav>
  );
}
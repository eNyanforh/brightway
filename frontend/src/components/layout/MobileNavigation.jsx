import { Link, NavLink } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./mobile-navigation.css";

// Keep the five approved mobile destinations in a predictable, keyboard-friendly order.
const items = [
  { label: "Explore", to: "/explore", icon: "explore" },
  { label: "Opportunity", to: "/opportunities", icon: "opportunities" },
  { label: "Post", to: "/explore?compose=post", icon: "post", compose: true },
  { label: "Network", to: "/network", icon: "network" },
  { label: "Learning", to: "/learning", icon: "learning" },
];

export default function MobileNavigation({ onNavigate }) {
  return (
    <nav className="bw-mobile-navigation" aria-label="Mobile navigation">
      {items.map(item => item.compose ? (
        <Link key={item.label} className="bw-mobile-compose-fab"
          to={item.to} onClick={onNavigate} aria-label="Create Post">
          <span className="bw-mobile-navigation-icon">
            <NavigationIcon name={item.icon} size={24} />
          </span>
          <span className="bw-mobile-navigation-label">{item.label}</span>
        </Link>
      ) : (
        <NavLink key={item.label} to={item.to} onClick={onNavigate}>
          {({ isActive }) => (
            <>
              <span className="bw-mobile-navigation-icon">
                <NavigationIcon name={item.icon} active={isActive} />
              </span>
              <span className="bw-mobile-navigation-label">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

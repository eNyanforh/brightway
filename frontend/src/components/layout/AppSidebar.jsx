import { NavLink } from "react-router-dom";
import Icon from "./Icon";

const items = [
  { label: "Explore", path: "/explore", icon: "compass" },
  { label: "Network", path: "/network", icon: "users" },
  { label: "Opportunities", path: "/opportunities", icon: "briefcase" },
  { label: "Learning", path: "/learning", icon: "book" },
];
export default function AppSidebar() {
  return (
    <div className="bw-app-navigation">
      <NavLink className="bw-app-brand" to="/explore">
        BrightWay
      </NavLink>
      <nav aria-label="Application navigation">
        {items.map((item) => (
          <NavLink key={item.path} to={item.path} aria-label={item.label}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
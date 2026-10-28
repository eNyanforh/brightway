import { NavLink, useLocation } from "react-router-dom";
import NavigationIcon from "./NavigationIcon";
import "./app-sidebar.css";

const navigation = [
  { label: "Explore", to: "/explore", icon: "explore" },
  {
    label: "Opportunities",
    to: "/opportunities",
    icon: "opportunities",
  },
  { label: "Network", to: "/network", icon: "network" },
  { label: "Learning", to: "/learning", icon: "learning" },
  { label: "Messages", icon: "messages" },
  { label: "Notifications", icon: "notifications" },
];

export default function AppSidebar({ id, open, onNavigate, hasWork = false }) {
  const { pathname } = useLocation();
  const items = [...navigation];
  if (hasWork) items.splice(4, 0, { label: "My Workspace", to: "/work", icon: "work" });
  return (
    <aside
      id={id}
      className={`bw-design-sidebar${
        open ? " bw-design-sidebar-open" : ""
      }`}
      aria-label="Navigation and organization"
    >
      <nav
        className="bw-design-sidebar-nav"
        aria-label="Main navigation"
      >
        {items.map((item) =>
          item.to ? (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                (isActive || item.label === "My Workspace" && pathname === "/organizations/new") ? "bw-design-sidebar-active" : ""
              }
            >
              {({ isActive }) => (
                <>
                  <NavigationIcon
                    name={item.icon}
                    active={isActive}
                  />
                  <span>{item.label}</span>
                  <span className="bw-design-sidebar-dot" />
                </>
              )}
            </NavLink>
          ) : (
            <button
              key={item.label}
              type="button"
              disabled
              title={`${item.label} is coming soon`}
            >
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ),
        )}
      </nav>

      {!hasWork && <><div className="bw-design-sidebar-divider" />

      <section className="bw-design-sidebar-organization">
        <span className="bw-design-sidebar-eyebrow">
          GROW TOGETHER
        </span>

        <h3>Make room for your organization.</h3>

        <p>
          Bring your school, company, or community to BrightWay.
        </p>

        <NavLink
          className="bw-design-create-org"
          type="button"
          onClick={onNavigate}
          to="/organizations/new"
        >
          <span className="bw-design-create-org-icon">
            <NavigationIcon name="plus" />
          </span>
          <span>Create an organization</span>
        </NavLink>
      </section></>}

      <p className="bw-design-sidebar-footer">
        Empower. Learn. Network. Earn.
      </p>
    </aside>
  );
}
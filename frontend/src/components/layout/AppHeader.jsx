import { Link } from "react-router-dom";
import HeaderProfileMenu from "./HeaderProfileMenu";
import NavigationIcon from "./NavigationIcon";
import "./app-header.css";

export default function AppHeader({
  actingOrganization,
  workspaceLabel,
  hasWork,
  photoId,
  unsaved,
  profileBusy,
  navigationOpen,
  navigationId,
  onToggleNavigation,
  navigationToggleRef,
}) {
  return (
    <header className="bw-design-header">
      <div className="bw-design-header-inner">
        <Link
          className="bw-design-brand"
          to="/explore"
          aria-label="BrightWay, go to Explore"
        >
          <span className="bw-design-brand-mark">
            b<span>↗</span>
          </span>

          <span className="bw-design-brand-wordmark">
            BrightWay
            <span className="bw-design-brand-dot">.</span>
          </span>
        </Link>

        <div
          className="bw-design-search"
          title="Search is coming soon"
        >
          <NavigationIcon name="search" size={19} />

          <input
            aria-label="Search — coming soon"
            placeholder="People, opportunities, ideas…"
            disabled
          />

          <button type="button" disabled>
            Search
          </button>
        </div>

        <div className="bw-design-account">
          <span className="bw-design-personal">
            <span />
            {actingOrganization?.name || workspaceLabel || "Personal account"}
          </span>

          <button
            className="bw-design-utility bw-design-mobile-action"
            type="button"
            disabled
            aria-label="Search — coming soon"
            title="Search is coming soon"
          >
            <NavigationIcon name="search" />
          </button>

          <button
            className="bw-design-utility bw-design-mobile-action"
            type="button"
            disabled
            aria-label="Messages — coming soon"
            title="Messages are coming soon"
          >
            <NavigationIcon name="messages" />
          </button>

          <button
            className="bw-design-utility bw-design-mobile-action"
            type="button"
            disabled
            aria-label="Notifications — coming soon"
            title="Notifications are coming soon"
          >
            <NavigationIcon name="notifications" />
          </button>

          <HeaderProfileMenu
            hasWork={hasWork}
            photoId={photoId}
            unsaved={unsaved}
            profileBusy={profileBusy}
          />

          <button
            className="bw-design-utility bw-design-navigation-toggle"
            type="button"
            ref={navigationToggleRef}
            aria-label="Toggle navigation"
            aria-expanded={navigationOpen}
            aria-controls={navigationId}
            onClick={onToggleNavigation}
          >
            <NavigationIcon name="menu" />
          </button>
        </div>
      </div>
    </header>
  );
}

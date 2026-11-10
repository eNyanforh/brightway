import { Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const personalSearch = !workspaceLabel && !actingOrganization;
  function submitSearch(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q").trim();
    if (q.length >= 2 && q.length <= 80) navigate("/search?" + new URLSearchParams({ q }));
  }

  return (
    <header className="bw-design-header">
      <div className="bw-design-header-inner">
        <Link
          className="bw-design-brand"
          to={workspaceLabel ? "/superadmin" : "/explore"}
          aria-label={workspaceLabel ? "BrightWay, go to Management" : "BrightWay, go to Explore"}
        >
          <span className="bw-design-brand-mark">
            b<span>↗</span>
          </span>

          <span className="bw-design-brand-wordmark">
            BrightWay
            <span className="bw-design-brand-dot">.</span>
          </span>
        </Link>

        {personalSearch && (
          <form className="bw-design-search" role="search" aria-label="Header search" onSubmit={submitSearch}>
            <NavigationIcon name="search" size={19} />
            <input name="q" type="search" aria-label="Search BrightWay content and people" placeholder="Search BrightWay…" minLength={2} maxLength={80} required />
            <button type="submit">Search</button>
          </form>
        )}

        <div className="bw-design-account">
          <span className="bw-design-personal">
            <span />
            {actingOrganization?.name || workspaceLabel || "Personal account"}
          </span>

          {personalSearch && (
            <Link className="bw-design-utility bw-design-mobile-action" to="/search" aria-label="Search BrightWay" title="Search BrightWay">
              <NavigationIcon name="search" />
            </Link>
          )}

          <button
            className="bw-design-utility bw-design-mobile-action"
            type="button"
            disabled
            aria-label="Messages — coming soon"
            title="Messages are coming soon"
          >
            <NavigationIcon name="messages" />
          </button>

          {workspaceLabel || actingOrganization ? (
            <button className="bw-design-utility bw-design-mobile-action" type="button" disabled aria-label="Notifications unavailable in this workspace" title="Switch to your personal account to view notifications">
              <NavigationIcon name="notifications" />
            </button>
          ) : (
            <Link className="bw-design-utility bw-design-mobile-action" to="/notifications" aria-label="Notifications" title="Notifications">
              <NavigationIcon name="notifications" />
            </Link>
          )}

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

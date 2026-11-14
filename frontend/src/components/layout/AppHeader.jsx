import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { searchDirectory } from "../../api/directory-search";
import { searchContent } from "../../api/content-search";
import HeaderProfileMenu from "./HeaderProfileMenu";
import BrightWayLogo from "./BrightWayLogo";
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
  const location = useLocation();
  const personalSearch = !workspaceLabel && !actingOrganization;
  const onSearchPage = location.pathname === "/search";
  const currentQuery = onSearchPage ? new URLSearchParams(location.search).get("q") || "" : "";
  const routeKey = location.pathname + location.search;
  const [searchDraft, setSearchDraft] = useState({ routeKey, value: currentQuery });
  const searchValue = searchDraft.routeKey === routeKey ? searchDraft.value : currentQuery;
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionPending, setSuggestionPending] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const inputRef = useRef(null);
  const searchWrapRef = useRef(null);

  // Input drafts belong to their current route. URL changes (tabs, Back/Forward,
  // live query updates) resolve directly without synchronizing state in an effect.
  useEffect(() => {
    if (!personalSearch || !onSearchPage) return undefined;
    const q = searchValue.normalize("NFC").trim().replace(/\s+/gu, " ");
    if (q === currentQuery || q.length === 1 || q.length > 80) return undefined;
    const wait = setTimeout(() => {
      const previous = new URLSearchParams(location.search);
      if (q.length >= 2) previous.set("q", q);
      else previous.delete("q");
      const qs = previous.toString();
      navigate("/search" + (qs ? "?" + qs : ""), { replace: true });
    }, 350);
    return () => clearTimeout(wait);
  }, [personalSearch, onSearchPage, searchValue, currentQuery, location.search, navigate]);

  // The mobile search icon opens the results route; focus the only input there.
  useEffect(() => {
    if (personalSearch && onSearchPage && window.matchMedia?.("(max-width: 700px)").matches) {
      inputRef.current?.focus();
    }
  }, [personalSearch, onSearchPage]);

  // Lightweight, debounced live previews away from the results page. Reuse
  // public, authenticated search APIs rather than introducing a second index.
  useEffect(() => {
    if (!personalSearch || onSearchPage || !suggestionOpen || searchValue.trim().length < 2 || searchValue.length > 80) {
      return undefined;
    }
    const controller = new AbortController();
    const wait = setTimeout(async () => {
      setSuggestionPending(true);
      try {
        const q = searchValue.trim();
        const results = await Promise.allSettled([
          searchDirectory(q, "all", null, controller.signal),
          searchContent(q, "all", null, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setSuggestions([
          ...(results[0].status === "fulfilled" ? results[0].value.items.slice(0, 4) : []),
          ...(results[1].status === "fulfilled" ? results[1].value.items.slice(0, 3) : []),
        ]);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestionPending(false);
      }
    }, 300);
    return () => { clearTimeout(wait); controller.abort(); };
  }, [personalSearch, onSearchPage, suggestionOpen, searchValue]);

  useEffect(() => {
    if (!suggestionOpen) return undefined;
    function closeOutside(event) {
      if (!searchWrapRef.current?.contains(event.target)) setSuggestionOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [suggestionOpen]);

  function submitSearch(event) {
    event.preventDefault();
    const q = searchValue.normalize("NFC").trim().replace(/\s+/gu, " ");
    if (q.length < 2 || q.length > 80) return;
    setSuggestionOpen(false);
    navigate("/search?" + new URLSearchParams({ q }));
  }
  function suggestionLabel(item) {
    if (item.kind === "programs") return "Program";
    if (item.kind === "opportunities") return "Opportunity";
    if (item.kind === "people") return "Person";
    if (item.kind === "organizations") return "Organization";
    return item.kind === "questions" ? "Question" : item.kind === "events" ? "Event" : "Achievement";
  }

  return (
    <header className={"bw-design-header" + (personalSearch ? " bw-design-header--personal" : "")}>
      <div className="bw-design-header-inner">
        <Link
          className="bw-design-brand"
          to={workspaceLabel ? "/superadmin" : "/explore"}
          aria-label={workspaceLabel ? "BrightWay, go to Management" : "BrightWay, go to Explore"}
        >
          <BrightWayLogo className="bw-design-brand-logo" width={42} height={42} />
          <span className="bw-design-brand-wordmark">BRIGHTWAY</span>
        </Link>

        {personalSearch && (
          <div ref={searchWrapRef} className={"bw-design-search-wrap" + (onSearchPage ? " bw-design-search-wrap--mobile-open" : "")}>
            <form className="bw-design-search" role="search" aria-label="Header search" onSubmit={submitSearch}>
              <NavigationIcon name="search" size={19} />
              <input ref={inputRef} name="q" type="search" autoComplete="off"
                aria-label="Search BrightWay content and people"
                placeholder="Search"
                enterKeyHint="search"
                value={searchValue} minLength={2} maxLength={80}
                onChange={event => { setSearchDraft({ routeKey, value: event.target.value }); setSuggestions([]); }}
                onFocus={() => { if (!onSearchPage) setSuggestionOpen(true); }}
                onKeyDown={event => { if (event.key === "Escape") setSuggestionOpen(false); }}
              />
              {searchValue && <button className="bw-design-search-clear" type="button"
                aria-label="Clear search" onClick={() => { setSearchDraft({ routeKey, value: "" }); inputRef.current?.focus(); }}>×</button>}
              <button type="submit" disabled={searchValue.trim().length < 2}>Search</button>
            </form>
            {suggestionOpen && !onSearchPage && searchValue.trim().length >= 2 && (
              <section className="bw-header-search-suggestions" aria-label="Search suggestions">
                <Link className="bw-header-search-all"
                  to={"/search?" + new URLSearchParams({ q: searchValue.trim() })}
                  onClick={() => setSuggestionOpen(false)}>
                  <NavigationIcon name="search" size={16} />
                  <span>Search all for <strong>{searchValue.trim()}</strong></span>
                </Link>
                {suggestionPending && <p role="status">Looking for matches…</p>}
                {!suggestionPending && suggestions.map(item => (
                  <Link key={item.href} className="bw-header-search-suggestion" to={item.href}
                    onClick={() => setSuggestionOpen(false)}>
                    <span className="bw-header-search-suggestion-name">{item.name}</span>
                    <span>{suggestionLabel(item)}</span>
                  </Link>
                ))}
                {!suggestionPending && suggestions.length === 0 &&
                  <p>Press Enter to search across BrightWay.</p>}
              </section>
            )}
          </div>
        )}

        <div className="bw-design-account">
          {personalSearch && !onSearchPage && (
            <Link className="bw-design-utility bw-design-mobile-action bw-design-compact-search" to="/search" aria-label="Search BrightWay" title="Search BrightWay">
              <NavigationIcon name="search" />
            </Link>
          )}

          <Link className="bw-design-utility bw-design-mobile-action bw-design-messages" to={workspaceLabel ? "/superadmin/official-messages" : actingOrganization ? `/organization-workspace/${actingOrganization.id}/messages` : "/messages"} aria-label="Messages" title="Messages">
            <NavigationIcon name="messages" />
          </Link>

          {workspaceLabel || actingOrganization ? (
            <button className="bw-design-utility bw-design-mobile-action" type="button" disabled aria-label="Notifications unavailable in this workspace" title="Switch to your personal account to view notifications">
              <NavigationIcon name="notifications" />
            </button>
          ) : (
            <Link className="bw-design-utility bw-design-mobile-action bw-design-notifications" to="/notifications" aria-label="Notifications" title="Notifications">
              <NavigationIcon name="notifications" />
            </Link>
          )}

          <HeaderProfileMenu
            actingOrganization={actingOrganization}
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

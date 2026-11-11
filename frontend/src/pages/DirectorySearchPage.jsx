import { LearningResults } from "./LearningPage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchDirectory } from "../api/directory-search";
import { memberPhotoUrl } from "../api/organization-posts";
import NavigationIcon from "../components/layout/NavigationIcon";
import VerificationBadge from "../components/VerificationBadge";
import ContentSearchResults from "./ContentSearchResults";
import OpportunityBrowser from "../components/opportunities/OpportunityBrowser";
import "./directory-search.css";

const filters = [
  ["all", "All"],
  ["people", "People"],
  ["organizations", "Organizations"],
  ["achievements", "Achievements"],
  ["questions", "Questions"],
  ["events", "Events"],
  ["opportunities", "Opportunities"],
  ["programs", "Programs"],
];

function initials(name) {
  return (name || "?").split(/\s+/u).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function SearchAvatar({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = item.kind === "people" && item.photoId && !imageFailed;
  return (
    <span className={"bw-directory-avatar " + (item.kind === "organizations" ? "bw-directory-avatar-org" : "")}>
      {image
        ? <img src={memberPhotoUrl(item.username, item.photoId)} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        : <span aria-hidden="true">{initials(item.name)}</span>}
    </span>
  );
}

function SearchResultCard({ item }) {
  const isPerson = item.kind === "people";
  return (
    <li>
      <Link className="bw-directory-result" to={item.href}>
        <SearchAvatar item={item} />
        <span className="bw-directory-result-info">
          <span className="bw-directory-result-name">
            <strong>{item.name}</strong>
            {item.verified === true && <VerificationBadge kind={isPerson ? "identity" : "organization"} />}
          </span>
          <span className="bw-directory-handle">@{item.username}</span>
          {item.matchType === "similar" && <span className="bw-directory-similar-label">Similar name or username</span>}
          {isPerson && item.headline && <span className="bw-directory-headline">{item.headline}</span>}
        </span>
        <span className="bw-directory-result-trailing">
          <span className="bw-directory-kind">{isPerson ? "Person" : "Organization"}</span>
          <NavigationIcon name="chevron-right" size={18} />
        </span>
      </Link>
    </li>
  );
}

function SearchResults({ q, kind }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const active = useRef(null);

  const load = useCallback(async cursor => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError("");
    try {
      const result = await searchDirectory(q, kind, cursor, controller.signal);
      if (!controller.signal.aborted) {
        setPage(previous => cursor && previous
          ? { ...result, items: [...previous.items, ...result.items] }
          : result);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure.status === 401 || failure.status === 403) setPage(null);
        setError(failure.message);
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }, [q, kind]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(); });
    return () => {
      mounted = false;
      active.current?.abort();
      active.current = null;
    };
  }, [load]);

  return (
    <section className="bw-directory-results" aria-label="Search results" aria-busy={pending}>
      {page?.items.length > 0 && (
        <p className="bw-directory-summary" role="status">Showing {page.items.length} result{page.items.length === 1 ? "" : "s"}{page.nextCursor ? " so far" : ""}</p>
      )}
      {pending && <p className="bw-directory-loading" role="status"><span className="bw-directory-spinner" aria-hidden="true" />Searching BrightWay…</p>}
      {error && (
        <div className="bw-directory-feedback" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load(page?.nextCursor)}>Retry search</button>
        </div>
      )}
      {!pending && !error && page?.items.length === 0 && (
        <div className="bw-directory-empty">
          <span className="bw-directory-empty-icon"><NavigationIcon name="search" size={24} /></span>
          <h2>No matches found</h2>
          <p>No results for “{q}”. Try a shorter name, headline, username, or organization name.</p>
        </div>
      )}
      {page?.items.length > 0 && (
        <ul className="bw-directory-list">
          {page.items.map(item => <SearchResultCard item={item} key={item.href} />)}
        </ul>
      )}
      {page?.nextCursor && !error && (
        <button type="button" className="bw-directory-more" disabled={pending} onClick={() => void load(page.nextCursor)}>More results</button>
      )}
    </section>
  );
}

export default function DirectorySearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const kind = filters.find(([value]) => value === params.get("kind"))?.[0] ?? "all";
  const searchable = q.length >= 2 && q.length <= 80;

  return (
    <section className="bw-directory-search" aria-label="Search results">
      <h1 className="bw-directory-sr-only">Search results</h1>
      <nav className="bw-directory-filters" aria-label="Search filters">
        {filters.map(([value, label]) => (
          <Link key={value} to={"/search?" + new URLSearchParams({ ...(q ? { q } : {}), kind: value })}
            aria-current={kind === value ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      {searchable ? (
        <>
          {kind === "all" ? (
            <>
              <h2 className="bw-directory-group-heading">People and organizations</h2>
              <SearchResults key={JSON.stringify([q, "all"])} q={q} kind="all" />
              <h2 className="bw-directory-group-heading">Community content</h2>
              <ContentSearchResults key={JSON.stringify([q, "content"])} q={q} kind="all" />
              <h2 className="bw-directory-group-heading">Programs</h2>
              <LearningResults key={JSON.stringify([q, "programs"])} filters={{ q, kind: "programs" }} />
              <h2 className="bw-directory-group-heading">Opportunities</h2>
              <OpportunityBrowser key={JSON.stringify([q, "opportunities"])} q={q} />
            </>
          ) : kind === "people" || kind === "organizations" ? (
            <SearchResults key={JSON.stringify([q, kind])} q={q} kind={kind} />
          ) : kind === "programs" ? (
            <LearningResults key={JSON.stringify([q, "programs"])} filters={{ q, kind: "programs" }} />
          ) : kind === "opportunities" ? (
            <OpportunityBrowser key={JSON.stringify([q, "opportunities"])} q={q} />
          ) : (
            <ContentSearchResults key={JSON.stringify([q, kind])} q={q} kind={kind} />
          )}
        </>
      ) : (
        <p className="bw-directory-prompt" role="status">
          <NavigationIcon name="search" size={18} /> Enter at least two characters in the search bar above to see results.
        </p>
      )}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchDirectory } from "../api/directory-search";
import NavigationIcon from "../components/layout/NavigationIcon";
import "./directory-search.css";

const filters = [
  ["all", "All"],
  ["people", "People"],
  ["organizations", "Organizations"],
];

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
      {pending && <p role="status">Searching BrightWay…</p>}
      {error && (
        <div className="bw-directory-feedback" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load(page?.nextCursor)}>Retry search</button>
        </div>
      )}
      {page?.items.length === 0 && <p className="bw-directory-feedback">No results for “{q}”. Try another name or username.</p>}
      {page?.items.length > 0 && (
        <ul>
          {page.items.map(item => (
            <li key={item.href}>
              <Link className="bw-directory-result" to={item.href}>
                <span className="bw-directory-icon"><NavigationIcon name={item.kind === "people" ? "network" : "work"} /></span>
                <span className="bw-directory-result-info">
                  <strong>{item.name}</strong>
                  <span>@{item.username}</span>
                </span>
                <span className="bw-directory-kind">{item.kind === "people" ? "Person" : "Organization"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor && !error && (
        <button type="button" disabled={pending} onClick={() => void load(page.nextCursor)}>More results</button>
      )}
    </section>
  );
}

export default function DirectorySearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const kind = filters.find(([value]) => value === params.get("kind"))?.[0] ?? "all";
  const searchable = q.length >= 2 && q.length <= 80;

  function submit(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q").trim();
    if (value.length >= 2 && value.length <= 80) setParams({ q: value, kind });
  }

  return (
    <section className="bw-directory-search">
      <header>
        <Link to="/explore">Explore</Link>
        <h1>Search BrightWay</h1>
        <p>Find people and verified organizations by name or username.</p>
      </header>
      <form role="search" aria-label="Directory search" onSubmit={submit}>
        <input key={q} name="q" type="search" aria-label="Name or username" placeholder="Name or username" defaultValue={q} minLength={2} maxLength={80} required />
        <button type="submit">Search</button>
      </form>
      {searchable && (
        <>
          <nav className="bw-directory-filters" aria-label="Search filters">
            {filters.map(([value, label]) => (
              <Link key={value} to={"/search?" + new URLSearchParams({ q, kind: value })} aria-current={kind === value ? "page" : undefined}>{label}</Link>
            ))}
          </nav>
          <SearchResults key={JSON.stringify([q, kind])} q={q} kind={kind} />
        </>
      )}
      {!searchable && <p className="bw-directory-feedback">Enter at least two characters to search.</p>}
    </section>
  );
}

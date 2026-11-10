import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { searchContent } from "../api/content-search";
import { memberPhotoUrl } from "../api/organization-posts";
import NavigationIcon from "../components/layout/NavigationIcon";
import VerificationBadge from "../components/VerificationBadge";

const labels = { achievements: "Achievement", questions: "Question", events: "Event" };
const icons = { achievements: "awards", questions: "question", events: "calendar" };

function ContentCard({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const author = item.member || {};
  const initials = (author.name || author.username || "?").split(/\s+/u).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  const date = item.createdAt && !Number.isNaN(Date.parse(item.createdAt))
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(item.createdAt))
    : null;

  return (
    <li>
      <Link className="bw-directory-content-card" to={item.href}>
        <div className="bw-directory-content-meta">
          <span className="bw-directory-content-type">
            <NavigationIcon name={icons[item.kind] || "post"} size={15} />
            {labels[item.kind] || "Post"}
          </span>
          {date && <time dateTime={item.createdAt}>{date}</time>}
        </div>
        <h3>{item.name}</h3>
        {item.summary && <p className="bw-directory-content-summary">{item.summary}</p>}
        {Array.isArray(item.tags) && item.tags.length > 0 && (
          <div className="bw-directory-content-tags">
            {item.tags.map(tag => <span key={tag}>#{tag}</span>)}
          </div>
        )}
        <div className="bw-directory-content-footer">
          <span className="bw-directory-content-author-avatar">
            {author.photoId && !imageFailed
              ? <img src={memberPhotoUrl(author.username, author.photoId)} alt=""
                  loading="lazy" onError={() => setImageFailed(true)} />
              : initials}
          </span>
          <span className="bw-directory-content-author">
            <strong>{author.name || author.username}</strong>
            <span>@{author.username}</span>
          </span>
          {author.verified === true && <VerificationBadge />}
          <span className="bw-directory-content-open">View post <NavigationIcon name="chevron-right" size={16} /></span>
        </div>
      </Link>
    </li>
  );
}

export default function ContentSearchResults({ q, kind }) {
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
      const result = await searchContent(q, kind, cursor, controller.signal);
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
    <section className="bw-directory-content-results" aria-label="Community search results" aria-busy={pending}>
      {page?.items?.length > 0 && (
        <p className="bw-directory-summary" role="status">
          Showing {page.items.length} community result{page.items.length === 1 ? "" : "s"}
          {page.nextCursor ? " so far" : ""}
        </p>
      )}
      {pending && <p role="status" className="bw-directory-loading">
        <span className="bw-directory-spinner" aria-hidden="true" />Searching community content…
      </p>}
      {error && <div className="bw-directory-feedback" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void load(page?.nextCursor)}>Retry search</button>
      </div>}
      {!pending && !error && page?.items.length === 0 && (
        <p className="bw-directory-feedback">
          No matching public community content for “{q}”{page.nextCursor ? " on this page. More results may be available." : "."}
        </p>
      )}
      {page?.items?.length > 0 && (
        <ul className="bw-directory-content-list">
          {page.items.map(item => <ContentCard key={item.href} item={item} />)}
        </ul>
      )}
      {page?.nextCursor && !error && (
        <button type="button" className="bw-directory-more" disabled={pending}
          onClick={() => void load(page.nextCursor)}>More community results</button>
      )}
    </section>
  );
}

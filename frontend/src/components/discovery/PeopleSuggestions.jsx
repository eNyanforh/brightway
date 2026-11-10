import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

export default function PeopleSuggestions() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const active = useRef(null);
  const load = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    setError("");
    try {
      const response = await fetch(apiBase + "/explore/suggestions/people", {
        signal, cache: "no-store", credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success !== true || !Array.isArray(payload.data?.items)) {
        throw new Error(payload?.message || "Suggestions are temporarily unavailable.");
      }
      if (!signal.aborted) setResult(payload.data.items);
    } catch (failure) {
      if (!signal.aborted) setError(failure.message || "Unable to reach BrightWay.");
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void load(); });
    return () => {
      mounted = false;
      active.current?.abort();
      active.current = null;
    };
  }, [load]);

  if (error) return <div role="alert" className="bw-suggestions-message">
    <p>{error}</p>
    <button type="button" onClick={() => void load()}>Retry suggestions</button>
  </div>;
  if (!result) return <p role="status" className="bw-suggestions-message">Finding suggested people…</p>;
  if (!result.length) return <p className="bw-suggestions-message">No suggestions yet. Add skills, interests or a career field to <Link to="/profile">your profile</Link> to help BrightWay find relevant people.</p>;
  return (
    <ul className="bw-suggestion-list">
      {result.map(person => (
        <li key={person.username}>
          <Link to={"/" + encodeURIComponent(person.username)}>{person.name}</Link>
          <span className="bw-suggestion-username">@{person.username}</span>
          <ul className="bw-suggestion-reasons" aria-label="Why this person is suggested">
            {person.reasons.map(reason => <li key={reason}>{reason}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  );
}

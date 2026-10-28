import { useEffect, useRef, useState } from "react";
import { credentialsApi } from "../../api/credentials";
export default function CredentialIssuerPicker({ kind, value, onChange, disabled }) {
  const [query, setQuery] = useState(""), [result, setResult] = useState(null), [error, setError] = useState(null), [searching, setSearching] = useState(false);
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), []);
  async function search() {
    if (disabled || query.trim().length < 2) return;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setSearching(true); setError(null);
    try { const next = await credentialsApi.issuers(kind, query.trim(), controller.signal); if (!controller.signal.aborted) setResult(next); }
    catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }
  return <fieldset disabled={disabled}><legend>Who issued this credential?</legend>
    <p>Search for the school or organization that issued your saved claim. Its authorized reviewers will receive your submission and private evidence. If it is not listed, BrightWay reviews it.</p>
    <label htmlFor="credential-issuer-search">Find school or organization</label>
    <input id="credential-issuer-search" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} />
    <button type="button" disabled={disabled || query.trim().length < 2 || searching} onClick={() => void search()}>{searching ? "Searching…" : "Search issuers"}</button>
    {error && <p role="alert">{error.message}</p>}
    {result && <><p>{result.refineSearch ? "Showing the first 20 matches. Refine your search if needed." : !result.organizations.length ? "No matching verified issuers found." : "Select the correct issuer. Similar names may belong to different organizations."}</p>
      {result.organizations.map(org => <label key={org.id}><input type="radio" name="credential-issuer" value={org.id} checked={value === org.id} onChange={() => onChange(org.id)} />{org.name}{org.locations?.[0] ? ` · ${org.locations[0].city}, ${org.locations[0].countryCode}` : ""}</label>)}
    </>}
    <label><input type="radio" name="credential-issuer" checked={value === "unlisted"} onChange={() => onChange("unlisted")} />My issuer is not listed — request BrightWay review</label>
    {value && value !== "unlisted" && !result?.organizations.some(org => org.id === value) && <p>An issuer is selected. Search again to see its directory entry.</p>}
  </fieldset>;
}

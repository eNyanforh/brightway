import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { campusApi } from "../../api/campus";
export default function CampusActivationEntry({ id }) {
  const [entry, setEntry] = useState(null);
  useEffect(() => { const c = new AbortController(); campusApi.onboarding(id, c.signal).then(v => { if (!c.signal.aborted && v.eligible) setEntry({ id, active: v.campus?.status === "ACTIVE", started: v.draft.version > 0 }); }).catch(async e => { if (e.status !== 403 || c.signal.aborted) return; try { await campusApi.workspace(id, "overview", c.signal); if (!c.signal.aborted) setEntry({ id, active: true, started: true }); } catch { /* No institutional Campus grant. */ } }); return () => c.abort(); }, [id]);
  if (entry?.id !== id) return null;
  return <p><Link to={`/campus/${id}${entry.active ? "" : "/setup"}`}>{entry.active ? "Open Virtual Campus" : entry.started ? "Resume Campus setup" : "Activate Virtual Campus"}</Link></p>;
}

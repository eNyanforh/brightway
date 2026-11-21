import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { campusApi } from "../../api/campus";
export default function CampusActivationEntry({ id }) {
  const [entry, setEntry] = useState(null);
  useEffect(() => { const c = new AbortController(); campusApi.onboarding(id, c.signal).then(v => { if (!c.signal.aborted && v.eligible) setEntry({ id, active: v.campus?.status === "ACTIVE", started: v.draft.version > 0 }); }).catch(() => {}); return () => c.abort(); }, [id]);
  if (entry?.id !== id) return null;
  return <p><Link to={`/campus/${id}${entry.active ? "" : "/setup"}`}>{entry.active ? "Open Virtual Campus" : entry.started ? "Resume Campus setup" : "Activate Virtual Campus"}</Link></p>;
}

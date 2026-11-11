import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { schoolApi as api } from "../../api/grade-school";
import "./grade-school.css";
export default function StudentCampusContexts() {
  const [items, setItems] = useState([]);
  useEffect(() => { const c = new AbortController(); api.myCampus(c.signal).then(data => { if (!c.signal.aborted) setItems([...new Map(data.items.map(r => [r.campusId, r])).values()]); }).catch(() => {}); return () => c.abort(); }, []);
  if (!items.length) return null;
  return <section className="bw-school-contexts" aria-label="Student Campus contexts"><h2>Student campuses</h2><ul>{items.map(r => <li key={r.campusId}><div><strong>{r.schoolName}</strong><p>{r.status === "PRE_REGISTERED" ? "Campus access is being finalized" : r.status.replaceAll("_", " ")}</p></div><Link to="/learning?view=campus">View student Campus</Link></li>)}</ul></section>;
}

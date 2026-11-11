import { useEffect, useState } from "react";
import { schoolApi as api } from "../../api/grade-school";
export default function CampusLearningTabs({ view, onSelect }) {
  const [access, setAccess] = useState({ student: false, guardian: false });
  useEffect(() => { const c = new AbortController();
    Promise.allSettled([api.myCampus(c.signal), api.guardians(c.signal)]).then(([student, guardian]) => {
      if (!c.signal.aborted) setAccess({ student: student.status === "fulfilled" && student.value.items.length > 0, guardian: guardian.status === "fulfilled" && guardian.value.items.length > 0 });
    }); return () => c.abort();
  }, []);
  return <>{(access.student || view === "campus") && <button type="button" aria-pressed={view === "campus"} onClick={() => onSelect("campus")}>My Campus</button>}{(access.guardian || view === "guardians") && <button type="button" aria-pressed={view === "guardians"} onClick={() => onSelect("guardians")}>Guardian access</button>}</>;
}

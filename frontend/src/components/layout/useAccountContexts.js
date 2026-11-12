import { useCallback, useEffect, useState } from "react";
import { staffApi } from "../../api/organization-staff";
import { schoolApi } from "../../api/grade-school";

function resolveContexts(directory, campus) {
  const organizations = (Array.isArray(directory?.items) ? directory.items : [])
    .filter(row => row?.id && row?.name)
    .map(row => ({ key: `org:${row.id}`, id: row.id, type: "organization",
      name: row.name, photoId: row.photoId || null, to: `/organization-workspace/${row.id}` }));
  const seen = new Set();
  const schools = (Array.isArray(campus?.items) ? campus.items : [])
    .filter(row => row?.campusId && row?.schoolName &&
      row.status === "ACTIVE" && row.studentStatus === "ACTIVE" && row.available === true)
    .filter(row => {
      if (seen.has(row.campusId)) return false;
      seen.add(row.campusId);
      return true;
    })
    .map(row => ({ key: `school:${row.campusId}`, id: row.campusId, type: "school",
      name: row.schoolName, photoId: row.photoId || null,
      to: `/learning?view=campus&campus=${encodeURIComponent(row.campusId)}` }));
  return [...organizations, ...schools];
}

/** Read only session-authorized memberships; URLs do not grant workspace access. */
export function useAccountContexts(accountId) {
  const [snapshot, setSnapshot] = useState({ accountId: null, generation: -1, items: [], error: false });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => setRefreshVersion(v => v + 1), []);
  useEffect(() => {
    if (!accountId) return undefined;
    const controller = new AbortController();
    Promise.allSettled([
      staffApi.directory(controller.signal, { tab: "approved" }),
      schoolApi.myCampus(controller.signal),
    ]).then(([organizations, schools]) => {
      if (controller.signal.aborted) return;
      const failure = organizations.status === "rejected" || schools.status === "rejected";
      setSnapshot({
        accountId,
        generation: refreshVersion,
        items: resolveContexts(
          organizations.status === "fulfilled" ? organizations.value : null,
          schools.status === "fulfilled" ? schools.value : null,
        ),
        error: failure,
      });
    });
    return () => controller.abort();
  }, [accountId, refreshVersion]);
  const valid = Boolean(accountId && snapshot.accountId === accountId && snapshot.generation === refreshVersion);
  return {
    contexts: valid ? snapshot.items : [],
    loading: Boolean(accountId && !valid),
    error: valid && snapshot.error,
    refresh,
  };
}


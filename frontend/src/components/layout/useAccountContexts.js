import { useCallback, useEffect, useState } from "react";
import { staffApi } from "../../api/organization-staff";
import { organizationEntryPath } from "../organizations/campus-entry";

function resolveContexts(directory) {
  return (Array.isArray(directory?.items) ? directory.items : [])
    .filter(row => row?.id && row?.name)
    .map(row => ({ key: `org:${row.id}`, id: row.id, type: "organization",
      name: row.name, photoId: row.photoId || null, to: organizationEntryPath(row) }));
}

/** Only active organization memberships appear while Virtual Campus is retired. */
export function useAccountContexts(accountId) {
  const [snapshot, setSnapshot] = useState({ accountId: null, generation: -1, items: [], error: false });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => setRefreshVersion(v => v + 1), []);
  useEffect(() => {
    if (!accountId) return undefined;
    const controller = new AbortController();
    staffApi.directory(controller.signal, { tab: "approved" }).then(directory => {
      if (!controller.signal.aborted) setSnapshot({ accountId, generation: refreshVersion, items: resolveContexts(directory), error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({ accountId, generation: refreshVersion, items: [], error: true });
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

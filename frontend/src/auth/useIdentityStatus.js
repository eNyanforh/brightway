import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { manualIdentityApi } from "../api/manual-identity";
import { identityLabels } from "../pages/manual-identity-format";

export function useIdentityStatus(profileVersion) {
  const { account } = useAuth();
  const accountId = account?.id;
  const [snapshot, setSnapshot] = useState(null), [refreshKey, setRefreshKey] = useState(0);
  const refreshIdentityStatus = useCallback(() => setRefreshKey((value) => value + 1), []);
  useEffect(() => {
    if (!accountId || !Number.isInteger(profileVersion)) return;
    let controller, disposed = false;
    async function check() {
      controller?.abort();
      const current = new AbortController(); controller = current;
      // Clear any prior grant before rechecking, including on a browser focus.
      await Promise.resolve();
      if (disposed || current.signal.aborted) return;
      setSnapshot(null);
      try {
        const data = await manualIdentityApi.status(current.signal);
        if (disposed || current.signal.aborted) return;
        if (data.accountId !== accountId || data.profileVersion !== profileVersion ||
            !Object.hasOwn(identityLabels, data.status) || typeof data.identityVerified !== "boolean" || typeof data.canSubmit !== "boolean") {
          throw Error("Reload your saved profile to check the latest identity verification status. Keep any unsaved edits you need first.");
        }
        setSnapshot({ accountId, profileVersion, refreshKey, data, error: "" });
      } catch (error) {
        if (!disposed && !current.signal.aborted && error.name !== "AbortError") setSnapshot({ accountId, profileVersion, refreshKey, data: null, error: error.message });
      }
    }
    void check(); window.addEventListener("focus", check);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", check); };
  }, [accountId, profileVersion, refreshKey]);
  const current = snapshot?.accountId === accountId && snapshot?.profileVersion === profileVersion && snapshot?.refreshKey === refreshKey;
  return { identityStatus: current ? snapshot.data : null, identityError: current ? snapshot.error : "", refreshIdentityStatus };
}

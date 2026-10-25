import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { manualIdentityApi } from "../../api/manual-identity";

export default function IdentityReviewerLink() {
  const { account } = useAuth();
  const accountId = account?.id;
  const [access, setAccess] = useState(null);
  useEffect(() => {
    if (!accountId) return;
    let controller, disposed = false;
    async function check() {
      controller?.abort();
      const current = new AbortController(); controller = current;
      try {
        const result = await manualIdentityApi.access(current.signal);
        if (!disposed && !current.signal.aborted) setAccess({ accountId, allowed: result.allowed === true });
      } catch (error) {
        if (!disposed && !current.signal.aborted && error.name !== "AbortError") setAccess({ accountId, allowed: false });
      }
    }
    void check();
    window.addEventListener("focus", check);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", check); };
  }, [accountId]);
  // Dedicated server permission and live MFA decide access, independent of the
  // reviewer's own profile-completion or credential-verification status.
  if (!accountId || access?.accountId !== accountId || access.allowed !== true) return null;
  return <Link to="/admin/manual-identity">Identity review workspace</Link>;
}

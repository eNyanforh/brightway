import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { managementApi } from "../../api/management";
import "./management-entry.css";
export default function ManagementEntry({ disabled, onOpen }) {
  const { account } = useAuth(), accountId = account?.id;
  const [access, setAccess] = useState(null);
  useEffect(() => {
    if (!accountId) return;
    let controller, disposed = false;
    async function check() {
      controller?.abort(); const current = new AbortController(); controller = current;
      try { const value = await managementApi.access(current.signal); if (!disposed && !current.signal.aborted) setAccess({ accountId, allowed: value.allowed === true && value.accountId === accountId }); }
      catch (error) { if (!disposed && !current.signal.aborted && error.name !== "AbortError") setAccess({ accountId, allowed: false }); }
    }
    void check(); window.addEventListener("focus", check);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", check); };
  }, [accountId]);
  if (!accountId || access?.accountId !== accountId || access.allowed !== true) return null;
  return <button className="bw-management-entry" type="button" disabled={disabled} onClick={onOpen}>BrightWay Management</button>;
}

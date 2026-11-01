import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { managementApi } from "../../api/management";
import "./management-entry.css";
export default function ManagementEntry({ disabled, onOpen }) {
  const { account } = useAuth(), accountId = account?.id;
  const [access, setAccess] = useState(null);
  const lastCheck = useRef(0);
  useEffect(() => {
    if (!accountId) return;
    let controller, disposed = false;
    async function check(force = false) {
      if (!force && Date.now() - lastCheck.current < 30_000) return;
      lastCheck.current = Date.now();
      controller?.abort(); const current = new AbortController(); controller = current;
      try { const value = await managementApi.access(current.signal); if (!disposed && !current.signal.aborted) setAccess({ accountId, allowed: value.allowed === true && value.accountId === accountId }); }
      catch (error) { if (!disposed && !current.signal.aborted && error.name !== "AbortError") setAccess({ accountId, allowed: false }); }
    }
    void check(true);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", onFocus); };
  }, [accountId]);
  if (!accountId || access?.accountId !== accountId || access.allowed !== true) return null;
  return <button className="bw-management-entry" type="button" disabled={disabled} onClick={onOpen}>BrightWay Management</button>;
}

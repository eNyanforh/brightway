import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManagementContext } from "./management-context";
import { managementAuthApi } from "../api/management-auth";
import { setReadIdentity } from "../api/read-cache";
import { subscribeFocus } from "./focus-refresh";
export default function ManagementProvider({ children }) {
  const [state, setState] = useState({ status: "loading", staff: null, error: null });
  const life = useRef(0), pending = useRef(null), mutation = useRef(false);
  const check = useCallback(() => {
    if (mutation.current) return;
    if (pending.current) return pending.current;
    const version = life.current;
    const task = managementAuthApi.me().then(({ staff }) => {
      if (version !== life.current) return;
      if (staff?.realm !== "management" || !/^mg_[a-f0-9-]{36}$/.test(staff.id)) throw Error("Management identity could not be verified.");
      setReadIdentity("management", staff.id); setState({ status: "authenticated", staff, error: null });
    }).catch(error => {
      if (version !== life.current) return;
      if ([401, 403].includes(error.status)) { setReadIdentity("management", null); setState({ status: "anonymous", staff: null, error: null }); }
      else setState(old => old.staff ? { ...old, error } : { status: "error", staff: null, error });
    }).finally(() => { if (pending.current === task) pending.current = null; });
    pending.current = task; return task;
  }, []);
  const dispose = useCallback(() => { life.current++; pending.current = null; setReadIdentity("management", null); }, []);
  useEffect(() => { void check(); const off = subscribeFocus(() => void check()); return () => { dispose(); off(); }; }, [check, dispose]);
  const login = useCallback(async body => {
    mutation.current = true; const version = ++life.current;
    try { const result = await managementAuthApi.login(body); if (version === life.current) { setReadIdentity("management", null); setState({ status: "anonymous", staff: null, error: null }); } return result; }
    finally { mutation.current = false; }
  }, []);
  const verify = useCallback(async body => {
    mutation.current = true; const version = ++life.current;
    try { const result = await managementAuthApi.verify(body); if (version === life.current) { setReadIdentity("management", result.staff.id); setState({ status: "authenticated", staff: result.staff, error: null }); } return result; }
    finally { mutation.current = false; }
  }, []);
  const logout = useCallback(async () => {
    mutation.current = true; const version = ++life.current;
    try { await managementAuthApi.logout(); if (version === life.current) { setReadIdentity("management", null); setState({ status: "anonymous", staff: null, error: null }); } }
    finally { mutation.current = false; }
  }, []);
  const value = useMemo(() => ({ ...state, check, login, verify, logout }), [state, check, login, verify, logout]);
  return <ManagementContext.Provider value={value}>{children}</ManagementContext.Provider>;
}

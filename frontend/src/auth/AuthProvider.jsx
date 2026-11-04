import { useLocation } from "react-router-dom";
import { subscribeFocus } from "./focus-refresh";
import { setReadIdentity } from "../api/read-cache";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { authApi } from "../api/auth";
import { AuthContext } from "./auth-context";

export default function AuthProvider({ children }) {
  const { pathname } = useLocation();
  const personalMode = !pathname.startsWith("/superadmin");
  const [session, setSession] = useState({
    status: "loading",
    account: null,
    error: "",
  });

  const version = useRef(0);
  const mutation = useRef(false);
  const pendingCheck = useRef(null);

  const checkSession = useCallback((signal, background = false) => {
    if (mutation.current) return;

    if (pendingCheck.current) {
      return pendingCheck.current;
    }

    const current = ++version.current;

    const task = authApi
      .me(signal)
      .then((data) => {
        if (current !== version.current) return;

        setReadIdentity("personal", data.account.id);
        setSession({
          status: "authenticated",
          account: data.account,
          error: "",
        });
      })
      .catch((error) => {
        if (
          error.name === "AbortError" ||
          current !== version.current
        ) {
          return;
        }

        if (error.status === 401) {
          setReadIdentity("personal", null);
          setSession({
            status: "anonymous",
            account: null,
            error: "",
          });
          return;
        }

        setSession((previous) => {
          // Keep the page visible during temporary background failures.
          if (
            background &&
            ["authenticated", "anonymous"].includes(previous.status)
          ) {
            return previous;
          }

          return {
            status: "error",
            account: null,
            error: error.message,
          };
        });
      })
      .finally(() => {
        if (pendingCheck.current === task) {
          pendingCheck.current = null;
        }
      });

    pendingCheck.current = task;
    return task;
  }, []);

  const refresh = useCallback(async () => {
    if (mutation.current) return;
    await checkSession(undefined, true);
  }, [checkSession]);

  useEffect(() => {
    if (!personalMode) return;
    const controller = new AbortController();

    void checkSession(controller.signal);

    return () => {
      controller.abort();
      pendingCheck.current = null;
      version.current += 1;
    };
  }, [checkSession, personalMode]);

  useEffect(() => {
    if (!personalMode) return;
    const onFocus = () => {
      void refresh();
    };

    const unsubscribeFocus = subscribeFocus(onFocus);

    return () => {
      unsubscribeFocus();
    };
  }, [refresh, personalMode]);

  const login = useCallback(async (body) => {
    mutation.current = true;
    const current = ++version.current;

    try {
      const data = await authApi.login(body);
      if (data.mfaRequired) {
        if (current === version.current) setSession({ status: "anonymous", account: null, error: "" });
        return { mfaRequired: true };
      }

      if (current === version.current) {
        setReadIdentity("personal", data.account.id);
        setSession({
          status: "authenticated",
          account: data.account,
          error: "",
        });
      }

      return data.account;
    } finally {
      mutation.current = false;
    }
  }, []);

  const verifyMfaLogin = useCallback(async (code) => {
    mutation.current = true;
    const current = ++version.current;
    try {
      const data = await authApi.verifyMfaLogin(code);
      if (current === version.current) { setReadIdentity("personal", data.account.id); setSession({ status: "authenticated", account: data.account, error: "" }); }
      return data.account;
    } finally { mutation.current = false; }
  }, []);

  const logout = useCallback(async () => {
    mutation.current = true;
    const current = ++version.current;

    try {
      await authApi.logout();
      setReadIdentity("personal", null);

      if (current === version.current) {
        setSession({
          status: "anonymous",
          account: null,
          error: "",
        });
      }
    } finally {
      mutation.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({
      ...session,
      login,
      verifyMfaLogin,
      logout,
      refresh,
    }),
    [session, login, verifyMfaLogin, logout, refresh]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
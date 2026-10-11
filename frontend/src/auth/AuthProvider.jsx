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

    // Reuse an active check instead of sending another request.
    if (pendingCheck.current) {
      return pendingCheck.current;
    }

    const current = ++version.current;

    const task = authApi
      .me(signal)
      .then((data) => {
        if (current !== version.current) return;

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
          setSession({
            status: "anonymous",
            account: null,
            error: "",
          });
          return;
        }

        setSession((previous) => {
          // Preserve the current page during temporary network failures.
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
    const controller = new AbortController();

    void checkSession(controller.signal);

    return () => {
      controller.abort();
      pendingCheck.current = null;
      version.current += 1;
    };
  }, [checkSession]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const login = useCallback(async (body) => {
    mutation.current = true;
    const current = ++version.current;

    try {
      const data = await authApi.login(body);

      if (current === version.current) {
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

  const logout = useCallback(async () => {
    mutation.current = true;
    const current = ++version.current;

    try {
      await authApi.logout();

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
      logout,
      refresh,
    }),
    [session, login, logout, refresh]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
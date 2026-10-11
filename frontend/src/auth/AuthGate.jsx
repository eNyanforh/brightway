import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { useAuth } from "./useAuth";

export default function AuthGate({ guest = false }) {
  const { status, error, refresh } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <main style={{ padding: 32 }} role="status">
        Checking your session…
      </main>
    );
  }

  if (status === "error") {
    return (
      <main style={{ padding: 32 }}>
        <p role="alert">{error}</p>

        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  if (guest) {
    const requested = location.state?.from?.pathname;

    const destination = [
      "/explore",
      "/network",
      "/opportunities",
      "/learning",
    ].includes(requested)
      ? requested
      : "/explore";

    return status === "authenticated" ? (
      <Navigate to={destination} replace />
    ) : (
      <Outlet />
    );
  }

  return status === "authenticated" ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      state={{ from: location }}
      replace
    />
  );
}
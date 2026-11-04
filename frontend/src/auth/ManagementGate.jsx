import { Navigate, Outlet } from "react-router-dom";
import { useManagement } from "./management-context";
export default function ManagementGate() {
  const { status, error, check } = useManagement();
  if (status === "loading") return <main role="status">Checking management session…</main>;
  if (status === "error") return <main><p role="alert">{error.message}</p><button onClick={() => void check()}>Retry management access</button></main>;
  return status === "authenticated" ? <Outlet /> : <Navigate to="/superadmin/login" replace />;
}

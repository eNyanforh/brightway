import { Navigate, Outlet } from "react-router-dom";
import { useManagement } from "./management-context";
import WorkspaceIcon from "../components/workspace/WorkspaceIcon";
export default function ManagementGate() {
  const { status, error, check } = useManagement();
  if (status === "loading") return <main className="bw-superadmin-login bw-mgmt-auth-state" role="status"><WorkspaceIcon name="shield" size={38} /><h1>Checking management session…</h1><p>Confirming your management identity before opening the workspace.</p></main>;
  if (status === "error") return <main className="bw-superadmin-login bw-mgmt-auth-state"><WorkspaceIcon name="shield" size={38} /><h1>Management access unavailable</h1><p role="alert">{error.message}</p><button onClick={() => void check()}>Retry management access</button></main>;
  return status === "authenticated" ? <Outlet /> : <Navigate to="/superadmin/login" replace />;
}

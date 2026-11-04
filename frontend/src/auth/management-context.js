import { createContext, useContext } from "react";
export const ManagementContext = createContext({ staff: null, status: "anonymous" });
export const useManagement = () => useContext(ManagementContext);

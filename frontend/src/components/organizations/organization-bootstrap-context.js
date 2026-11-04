import { createContext, useContext } from "react";
export const OrganizationBootstrapContext = createContext(null);
export const useOrganizationBootstrap = () => useContext(OrganizationBootstrapContext);

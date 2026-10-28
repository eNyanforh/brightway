import { NavLink } from "react-router-dom";
export default function WorkTabs() {
  return <nav className="bw-work-tabs" aria-label="Work tabs">
    <NavLink to="/work">My Workspace</NavLink>
    <NavLink to="/organizations/new">+ Create an organization</NavLink>
  </nav>;
}

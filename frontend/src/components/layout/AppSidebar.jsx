
import { NavLink } from "react-router-dom";
import styled from "styled-components";

const Sidebar = styled.aside`
  width: 240px;
  flex-shrink: 0;
  min-height: 100vh;
  padding: 28px 16px;
  background: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: ${({ theme }) => theme.breakpoints.mobile}) {
    width: 100%;
    min-height: auto;
    border-right: none;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

const Brand = styled(NavLink)`
  display: block;
  margin-bottom: 32px;
  padding-left: 12px;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 24px;
  font-weight: 800;
`;

const Navigation = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 6px;

  @media (max-width: ${({ theme }) => theme.breakpoints.mobile}) {
    flex-direction: row;
    flex-wrap: wrap;
  }
`;

const MenuLink = styled(NavLink)`
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textMuted};

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }

  &[aria-current="page"] {
    background: ${({ theme }) => theme.colors.primaryLight};
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 700;
  }
`;

const menuItems = [
  { label: "Explore", path: "/explore" },
  { label: "Network", path: "/network" },
  { label: "Opportunities", path: "/opportunities" },
  { label: "Learning", path: "/learning" },
];

function AppSidebar() {
  return (
    <Sidebar>
      <Brand to="/">BrightWay</Brand>

      <Navigation aria-label="Application navigation">
        {menuItems.map((item) => (
          <MenuLink key={item.path} to={item.path}>
            {item.label}
          </MenuLink>
        ))}
      </Navigation>
    </Sidebar>
  );
}

export default AppSidebar;

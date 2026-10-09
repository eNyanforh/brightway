
import { Link, NavLink } from "react-router-dom";
import styled from "styled-components";

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 6%;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: ${({ theme }) => theme.breakpoints.mobile}) {
    flex-wrap: wrap;
  }
`;

const Brand = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 24px;
  font-weight: 800;
`;

const Navigation = styled.nav`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;

  a {
    font-weight: 500;
  }

  a[aria-current="page"] {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const RegisterLink = styled(NavLink)`
  padding: 10px 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: white;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
`;

function PublicHeader() {
  return (
    <Header>
      <Brand to="/">BrightWay</Brand>

      <Navigation aria-label="Public navigation">
        <NavLink to="/" end>
          Home
        </NavLink>

        <NavLink to="/login">Login</NavLink>

        <RegisterLink to="/register">
          Join BrightWay
        </RegisterLink>
      </Navigation>
    </Header>
  );
}

export default PublicHeader;

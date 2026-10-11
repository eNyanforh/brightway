import { Outlet } from "react-router-dom";
import styled from "styled-components";

import AppSidebar from "../components/layout/AppSidebar";
import AccountMenu from "../components/layout/AccountMenu";

const Container = styled.div`
  display: flex;
  min-height: 100vh;

  @media (max-width: ${({ theme }) =>
      theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;

const Content = styled.main`
  flex: 1;
  min-width: 0;
  padding: 32px;

  @media (max-width: ${({ theme }) =>
      theme.breakpoints.mobile}) {
    padding: 20px;
  }
`;

export default function AppLayout() {
  return (
    <Container>
      <AppSidebar />

      <Content>
        <AccountMenu />
        <Outlet />
      </Content>
    </Container>
  );
}

import { Outlet } from "react-router-dom";
import styled from "styled-components";
import PublicHeader from "../components/layout/PublicHeader";

const Main = styled.main`
  width: min(1100px, 100%);
  margin: 0 auto;
  padding: 48px 24px;
  min-height: calc(100vh - 90px);
`;

/**
 * Outlet renders the active child route.
 *
 * The header stays visible while users move
 * between public pages.
 */
function PublicLayout() {
  return (
    <>
      <PublicHeader />
      <Main>
        <Outlet />
      </Main>
    </>
  );
}

export default PublicLayout;

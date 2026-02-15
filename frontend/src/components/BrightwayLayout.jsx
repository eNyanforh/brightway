// BrightWayLayout.js
import React from "react";
import styled from "styled-components";
import { useNavigate, useLocation } from "react-router-dom";

export default function BrightWayLayout({ leftSidebar, mainContent, rightSidebar }) {
  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { name: "Home", icon: "/icons/home-black.png", activeIcon: "/icons/home-blue.png", path: "/feed" },
    { name: "My Network", icon: "/icons/users-black.png", activeIcon: "/icons/network-blue.png", path: "/network" },
    { name: "Opportunities", icon: "/icons/oppo-black.png", activeIcon: "/icons/oppo-blue.png", path: "/opportunities" },
    { name: "Academics", icon: "/icons/graduationcap-black.png", activeIcon: "/icons/graduationcap-blue.png", path: "/academics" },
    { name: "Partners", icon: "/icons/partners-black.png", activeIcon: "/icons/partner-blue.png", path: "/partners" },
  ];

  const smallNav = [
    {name: "Chat", icon:"/icons/dm-fill-black.png", path:"/chat", activeIcon:"/icons/chat-blue.png"},
    {name: "Notification", icon: "/icons/bell-black-fill.png", path:"/notification"},
    {name: "Profile", icon:"/icons/profile-black.png", path:"/profile"}
  ]

  // const activeNav = navLinks.find(link => link.path === location.pathname)?.name || "Home";

  return (
    <Container>
      {/* HEADER */}
      <Header>
        <LogoSearch>
          <Logo>
            <img src="/logo/brightwaylogo.png" alt="BrightWay Logo" />
          </Logo>
          <SearchInput type="text" placeholder="Search BrightWay..." />
        </LogoSearch>

        <Nav>
          {navLinks.map(link => (
            <NavItem
              key={link.name}
              active={location.pathname === link.path}
              onClick={() => navigate(link.path)}
            >
              <div>
                <img
                  src={location.pathname === link.path ? link.activeIcon : link.icon}
                  alt={link.name}
                />
              </div>
              <span>{link.name}</span>
            </NavItem>
          ))}
        

        <RightNav>
          {smallNav.map(snav => (
            <IconButton
            key={snav.name}
              active={location.pathname === snav.path}
              onClick={() => navigate(snav.path)}
            >
              <img
                  src={location.pathname === snav.path ? snav.activeIcon : snav.icon}
                  alt={snav.name}
                />
            </IconButton>
            
          ))}
          {/* <IconButton>
            <img src="/icons/dm-fill-black.png" alt="DM" />
          </IconButton>
          <IconButton>
            <img src="/icons/bell-black-fill.png" alt="Notifications" />
          </IconButton>
          <IconButton>
            <img src="/icons/profile-black.png" alt="Profile" />
          </IconButton> */}
        </RightNav>
        </Nav>
      </Header>

      {/* BODY */}
      <Body>
        <Sidebar>{leftSidebar}</Sidebar>
        <MainFeed>{mainContent}</MainFeed>
        <Sidebar>{rightSidebar}</Sidebar>
      </Body>
    </Container>
  );
}

/* ---------------- Styled Components ---------------- */
const Container = styled.div`
  display:flex; flex-direction:column; min-height:100vh; background:#f3f4f6;
  font-family: "Inter";
`;

const Header = styled.header`
  display:flex; align-items:center; justify-content:space-around;padding:10px 24px; background:#fff; border-bottom:1px solid #e5e7eb; position:sticky; top:0; z-index:100;
`;

const LogoSearch = styled.div` display:flex; align-items:center; gap:12px;`;
const Logo = styled.div` img{ height:45px; width:auto; } `;
const SearchInput = styled.input`
  padding:10px 40px; border:2px solid #d1d5db; background-color:rgba(217,217,217,0.3); border-radius:999px; font-size:0.9rem; outline:none;
  font-family:"Inter"; font-weight:600;
  &:focus{ outline:none; border:2px solid #3b82f6; background-color:rgba(217,217,217,0.5); box-shadow:0 0 6px rgba(59,130,246,0.3); }
`;

const Nav = styled.nav` display:flex; gap:20px; `;
const NavItem = styled.button`
  width:80px; display:flex; flex-direction:column; align-items:center; font-size:0.75rem; color:#4b5563; background:none; border:none; cursor:pointer; gap:4px; position:relative;
  &:hover{ color:#2563eb; }
  div{ width:28px; height:28px; display:flex; align-items:center; justify-content:center; }
  img{ max-width:25px; max-height:25px; object-fit:contain; }
  span{ font-weight:600; font-size:0.8rem; }
  ${({ active }) => active && `
    color:#2563eb;
    &::after{
      content:""; position:absolute; bottom:-4px; left:0; right:0; height:3px; background-color:#2563eb; border-radius:2px;
    }
  `}
`;

const RightNav = styled.div` display:flex; gap:10px; background-color:#e5e7eb;padding:0 10px;border-radius:20px;`;
const IconButton = styled.button`
  width:45px; height:45px; border-radius:50%; border:none; background:none; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:0.2s;
  &:hover{ background:#e5e7eb; }
  img{ width:25px; height:25px; object-fit:contain; }
`;

const Body = styled.main` display:flex; flex:1; gap:40px; padding:20px;justify-content:center;font-family:"Inter";`;
const Sidebar = styled.aside` width:20%; display:none; @media(min-width:1024px){ display:block; } `;
const MainFeed = styled.section` flex:1; max-width:600px; display:flex; flex-direction:column; gap:16px;`;

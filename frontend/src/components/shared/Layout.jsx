import React, { useState } from "react";
import styled from "styled-components";
import { Link,useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import LoginModal from "../../pages/LoginModal";
import SignupModal from "../signup/SignupModal";


export const Container = styled.div`
  font-family: 'Inter', sans-serif;
  width: 100%;
  height: 100vh;
  overflow: hidden;
`;

export const TopNav = styled.section`
  display: flex;
  font-size: 1.2rem;
  background-color: #000;
  width: 100%;
  height: 5vh;
  align-items: center;
  padding: 1rem 2rem;
  gap: 2rem;

  div {
    color: white;
    // font-weight: 600;
  }

  div span {
    color: #3B82F6;
  }

  a {
    text-decoration: none;
  }

  @media (max-width: 1100px) {
    display: none;
  }
`;

const Navbar = styled.nav`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: white;
  border-bottom: 1px solid #eaeaea;
  height: 10vh;
  font-weight: 500;

  @media (max-width: 1100px) {
    height: 8vh;
    padding:0 0.8rem;
  }
`;
export const LogoSearch = styled.div` display:flex; align-items:center; gap:1%;`;

export const Logo = styled.div`
display:flex; align-items:center; 
font-family: "Inter", sans-serif;
gap:10px;
  font-weight: 900;
  font-size: 1.8rem;
   img{ height:45px; width:auto; }

  @media (max-width: 1100px) {
    font-size: 1.2rem;
    gap:5px;
    img{
    height:28px;

    }
  }
`;

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  flex: 4;


  @media (max-width: 1100px) {
    display: none;
  }
`;

const PrimaryNavLinks = styled.div`
  display: flex;
 

  a {
    position: relative;
    text-decoration: none;
    color: #000;
    margin-left: 1.5rem;
    padding-bottom: 6px;
    
  }

  a.active::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -1px;
    transform: translateX(-50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #3B82F6;
  }

  @media (max-width: 1100px) {
    flex-direction: column;
    margin-top: 1rem;
    background: #f9f9f9;
    padding: 1rem;
    display: ${props => (props.show ? "flex" : "none")};
  }
`;


export const OnboardingLinks = styled.div`
  display: flex;

  @media (max-width: 1100px) {
    display: none;
  }
`;

export const StyledLinkButton = styled(Link)`
  padding: 0.4rem 1.3rem;
  border-radius: 20px;
  font-weight: 600;
  font-size:1rem;
  border: 2px solid #3B82F6;
  background-color: ${props => (props.primary ? "#3B82F6" : "#ffffff")};
  color: ${props => (props.primary ? "#ffffff" : "#000000")};
  text-decoration: none;
  text-align: center;
  margin-left: 1rem;
`;

const Icon = styled.div`
  display: none;

  @media (max-width: 1100px) {
    display: flex;
    cursor: pointer;
    z-index: 600000000;
position: relative;
  }
`;

export const Footer =styled.div`
flex-grow:1;
background-color:black;
display: flex;
flex-direction: column;
 padding: 2rem 1rem;
gap: 1.7rem;
`

const FooterLinks = styled.div`
color:white;
display: flex;
  flex-direction: column;
  
  gap: 0.8rem;

  a {
    text-decoration: none;
    font-size: 1rem;
    color: #fff;
  }
`

const FooterOnboarding = styled.div`
display:flex;
flex-direction: column;
gap:1rem;
margin-top:1rem;

`

// const edit = styled.(AnimatePresence)`
//     a {
// text-decoration: none;
// font-size: 1.2rem;
// olor: #000;
// font-weight: 600;
// }


const MobileMenu = styled.div`
margin-top:50px;
  background: white;
  display: flex;
  flex-direction: column;
  padding: 2rem 1rem;
  gap: 1rem;

  a {
    text-decoration: none;
    font-size: 1rem;
    color: #000;
    font-weight: 600;
  }
`;

export const MobileOnboardingLinks = styled.div`
display:none;
@media (max-width:1100px) {
font-size:1rem;
display:flex;
width:75%;
flex-direction:column;
gap:1rem;
z-index:1;
margin-bottom:30px;
margin-top:-48px;
`

export const Hero = styled.section`
position:relative;
  display: flex;
flex-direction:column;
  padding-left: 2rem;
  align-items: center;
  justify-content:center;   
  background-image: url("/image/bg8.png");
  background-position: center;
  background-size:cover;
  height: 90vh;
 
  @media (max-width:1100px) {
   position: relative;
  height:92vh;
  justify-content:flex-start;
  align-items:center;
  padding-left:0;
  padding-top:2rem;
  overflow:scroll;
  }
`;



export const HeroText = styled.div`
width:900px;
text-align:center;
z-index:110000;
color:white;
margin-bottom:2rem;

  min-width: 300px;
  padding-right: 2rem;
  font-size: 1.2rem;
  @media (max-width:1100px) {
  text-align:center;
  width:100%;
  padding-right:0;
  }

`;

export const HeroHeading = styled.h1`
  font-size: 2.75rem;
  font-weight: 800;
  margin-bottom: 1rem;
  line-height:1.5;
  span {
    color: #3B82F6;
  }

  @media (max-width:1100px) {
  font-size:1.5rem;
  font-weight:bold;
  margin-bottom:2rem;
  padding:0 1.5rem;
  }
  
  }
`;

export const PageTitle = styled.h3`
text-transform: uppercase;
font-size: 2rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  color:#3B82F6;
@media(max-width:1100px) {
  font-size:1.2rem;
  letter-spacing:0;
  margin-bottom:0.5rem;
  margin-top:1rem;
  }
  `

export const FeatureListContainer = styled.div`
  width: 300px;
  height: 165px;
  background-color:  #3B82F6;
  border-radius: 20px;
  margin-left: 10px;
  margin-bottom:20px;
  x-index:1000;

  @media (max-width:1100px) {
margin-top: 10px;
text-align:center;
width:17.5rem;
height:11.25rem;
font-size:1rem;
  }
`;

export const FeatureList = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  position: relative;
  top: -10px;
  left: -10px;
  width: 295px;
  height: 170px;
  padding:0 2rem;
  background-color: white;
  border-radius: 20px;
  border: 4px solid  #3B82F6;

    @media (max-width:1100px) {
    padding: 0 1.25rem;
   
    
  }

  @media(max-width:1100px) {
  width:17.1875rem;
  height:10.9375rem;
  }
`;

// const HeroImage = styled.div`
//   flex: 1;
//   min-width: 300px;
//   display: flex;
//   justify-content: flex-end;
//   height: 100%;
//   background-image: url("/brightway2.webp");
//   background-size: cover;
//   background-repeat: no-repeat;
//   background-position: bottom right;
//   position: relative;
//   top: 20px;
//   left: 100px;

//   @media (max-width:1100px) {
//   display:none;
  
//   }
// `;


export const OurFeautures = styled.section`
display:flex;
color:black;
text-align:center;
z-index:1000;
// font-size:1.2rem;
gap:2rem;


@media (max-width:1100px) {
display:flex;
flex-wrap: wrap;
justify-content:center;
align-items:center;
gap:0.5rem;
}

//  @media (orientation: landscape) {
//     display: none;
//   }
// `
// TopNav`
// display:none;
// `

export const Overlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 0;

  @media (max-width: 1100px) {
    // display: none;
    height:140%
  }
`;

export const PartnersCta = styled(Link)`
display:flex;
align-items:center;
  padding: 0.7rem 3rem;
  background-color:white;
  border-radius: 30px;
  margin-top: 20px;
  
  color: white;
  text-decoration: none;
  font-weight: 600;
  z-index:100;

  @media(max-width:1100px){
  padding: 0.6rem 4.5rem;
  display:none;
  }

  p{
  color:black;
  }
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1000000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ModalCard = styled.div`
  background: #ffffff;
  width: 100%;
  max-width: 420px;
  padding: 2rem;
  border-radius: 16px;
  position: relative;
`;

const CloseModal = styled.button`
  position: absolute;
  top: 14px;
  right: 14px;
  background: none;
  border: none;
  cursor: pointer;
`;

export function Layout({ children}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignUpStep1, setShowSignupStep1] = useState(false)
 const location = useLocation();


  return (
    <>
      {/* <TopNav>
        <Link to="/">
          <div>
            <span style={{ color: activeTab === "individuals" ? "#3B82F6" : "white" }}>Individuals</span>
          </div>
        </Link>
        <Link to="/schools">
          <div>
            <span style={{ color: activeTab === "schools" ? "#3B82F6" : "white" }}>Schools</span>
          </div>
        </Link>
      </TopNav> */}
      <Navbar>
        <Logo>
            <img src="/logo/brightwaylogo.png" alt="BrightWay Logo" />
            BRIGHTWAY
          </Logo>
  
          <PrimaryNavLinks>
  <Link
    to="/"
    className={location.pathname === "/" ? "active" : ""}
  >
    For Individuals
  </Link>

  <Link
    to="/schools"
    className={location.pathname === "/schools" ? "active" : ""}
  >
    For Schools
  </Link>

  <Link
    to="/partner"
    className={location.pathname === "/partner" ? "active" : ""}
  >
    For Companies
  </Link>

  {/* <Link
    to="/about"
    className={location.pathname === "/about" ? "active" : ""}
  >
    About Us
  </Link> */}
  
</PrimaryNavLinks>

          <OnboardingLinks>
           <StyledLinkButton
  as="button"
  onClick={() => setShowLoginModal(true)}
>
  Login
</StyledLinkButton>

            <StyledLinkButton as="button" onClick={() => setShowSignupStep1(true)} primary>Join for free</StyledLinkButton>
          </OnboardingLinks>
        
        <Icon onClick={() => setShowMenu(!showMenu)}>
  {showMenu ? <X size={30} /> : <Menu size={30} />}
</Icon>
      </Navbar>
      <AnimatePresence>
  {showMenu && (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "tween", duration: 0.3 }}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        background: "white",
        width: "70%",
        height: "150vh",
        boxShadow: "-2px 0 10px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        // padding: "2rem 1rem",
        // gap: "1rem",
        zIndex: 500000,
        textDecoration: "none",
        // paddingTop: "100px",
        // paddingLeft: "30px",
      
        

//         a {{}
// //     text-decoration: none;
// //     font-size: 1.2rem;
// //     color: #000;
// //     font-weight: 600;
// //   }
      }}
    >

<MobileMenu>
  <Link to="/" onClick={() => setShowMenu(false)}>For Individuals</Link>

<Link to="/schools" onClick={() => setShowMenu(false)}>For Schools</Link>

      
      <Link to="/partner" onClick={() => setShowMenu(false)}>For Companies</Link>
    </MobileMenu>
     
      <Footer>
        <Logo style={{color:"white"}}>BRIGHTWAY</Logo>
        <FooterLinks>
      <Link to="/schools" onClick={() => setShowMenu(false)}>Terms & Condition</Link>
      <Link to="/about" onClick={() => setShowMenu(false)}>Cookie Policy</Link>
      <Link to="/partner" onClick={() => setShowMenu(false)}>EULA</Link>
    </FooterLinks>
    <FooterOnboarding>
 <StyledLinkButton as="button" onClick={() => setShowLoginModal(true)} style={{color:" #3B82F6", backgroundColor:"transparent"}}>Login</StyledLinkButton>
      <StyledLinkButton as="button" onClick={() => setShowSignupStep1(true)} primary>Join for free</StyledLinkButton>
      </FooterOnboarding>
      </Footer>
    </motion.div>

  )}
</AnimatePresence>
{showLoginModal && (
  <LoginModal onClose={() => setShowLoginModal(false)} />
)}

{showSignUpStep1 && (
  <SignupModal onClose={() => setShowSignupStep1(false)} />
)}
      {children}
    </>
  );
}

import React from "react";
import { Layout, Container, StyledLinkButton,MobileOnboardingLinks} from "../components/shared/Layout";
import styled from "styled-components";


const Hero = styled.section`
position:relative;
  display: flex;
//   flex-wrap: wrap;
flex-direction:column;
  padding-left: 2rem;
  align-items: center;
  justify-content:center;   
  background-image: url("/bg8.png");
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



const HeroText = styled.div`
width:600px;
text-align:center;
z-index:110000;
color:white;

  min-width: 300px;
  padding-right: 2rem;
  font-size: 1.2rem;
  @media (max-width:1100px) {
  text-align:center;
  width:100%;
  padding-right:0;
  }

`;

const HeroHeading = styled.h1`
  font-size: 3.75rem;
  font-weight: 800;
  margin-bottom: 1rem;


  span {
    color: #3B82F6;
  }

  @media(max-width:1100px) {
  font-size:1.875rem;
  margin-bottom:0.5rem;
  margin-top:1rem;
  
  }
`;

const HeroSubtext = styled.p`
  margin-bottom: 3rem;
  font-size: 1.25rem;

//   font-weight: bold;

   @media (max-width:1100px) {
  font-size:0.9rem;
  font-weight:normal;
  margin-bottom:2rem;
  padding:0 1.5rem;
  }
`;

const FeatureListContainer = styled.div`
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

const FeatureList = styled.div`
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
  border: 4px solid  #3B82F6;;

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


const OurFeautures = styled.section`
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

const Overlay = styled.div`
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

export default function Home() {
  return (
    <Container>
      <Layout activeTab="individuals">
      <Hero>
         <Overlay />
 
  <HeroText>
    <HeroHeading>We’re on a <br/><span>Mission</span></HeroHeading>
    <HeroSubtext>To make learning, networking, and professional growth
 accessible and meaningful for students and youth across 
Africa and beyond.</HeroSubtext>
</HeroText>
<MobileOnboardingLinks>
  <StyledLinkButton to="/login">Login</StyledLinkButton>
              <StyledLinkButton to="/signup" primary>Join for free</StyledLinkButton>
</MobileOnboardingLinks>
    <OurFeautures>
      
                <FeatureListContainer>
                  <FeatureList>
                    <p>
                        <img src="/compass1.png" style={{width:"55px"}}/>
                    </p>
                    <p>Direct pathways to jobs, 
internships, scholarships, and 
global opportunities</p>
                  </FeatureList>
                </FeatureListContainer>

                <FeatureListContainer>
                  <FeatureList>
                    <p>
                        <img src="/users1.png" style={{width:"55px"}}/>
                    </p>
                    <p>A growing network of like-minded individuals and partners</p>
                  </FeatureList>
                </FeatureListContainer>

                <FeatureListContainer>
                  <FeatureList>
                    <p>
                        <img src="/student1.png" style={{width:"55px"}}/>
                    </p>
                    <p>Verified school and academic  
AI tools to streamline learning</p>
                  </FeatureList>
                </FeatureListContainer>
    </OurFeautures>
             {/* <Footer/> */}

  {/* <HeroImage /> */}
      </Hero>
      </Layout>
    </Container>
  );
}

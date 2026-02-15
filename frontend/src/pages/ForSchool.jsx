import React from "react";
import { Layout, Container, StyledLinkButton,MobileOnboardingLinks, PartnersCta, Hero, HeroHeading, HeroText, PageTitle, FeatureList, FeatureListContainer,OurFeautures, Overlay} from "../components/shared/Layout";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
export default function SchoolHomepage() {
  const navigate = useNavigate();
  const handleGetInTouch = () => {
    
    navigate("/login", { state: { message: "Log in to your personal account to create a partner account" } });
  };
  return (
    <Container>
      <Layout activeTab="individuals">
      <Hero>
         <Overlay />
         
 
  <HeroText >
    <PageTitle>Brightway FOR SCHOOLS</PageTitle>
    <HeroHeading style={{lineHeight: '1'}}>Connect with learners globally, empower their growth, and transform potential into results.</HeroHeading>
    {/* <HeroSubtext>Brightway is an AI-driven ecosystem built to empower students, connect schools, and deliver opportunities through intelligent tools.</HeroSubtext> */}
  
</HeroText>
<MobileOnboardingLinks>
              <StyledLinkButton to="/signup" primary>Partner with us</StyledLinkButton>
</MobileOnboardingLinks>
    <OurFeautures>
                <FeatureListContainer>
                  <FeatureList>
                    <p>
                        <img src="/globe.png" style={{width:"55px"}}/>
                    </p>
                    <p>Build direct, trusted relationships with students and graduates.</p>
                  </FeatureList>
                </FeatureListContainer>

                <FeatureListContainer>
                  <FeatureList>
                    <p>
                        <img src="/users1.png" style={{width:"55px"}}/>
                    </p>
                    <p>Join a network of learners, mentors, employers, and schools.</p>
                  </FeatureList>
                </FeatureListContainer>

                <FeatureListContainer>
                  <FeatureList>
                    <p>
                        <img src="/teachers.png" style={{width:"55px"}}/>
                    </p>
                    <p>Manage your students, lessons, and instructors with ease</p>
                  </FeatureList>
                </FeatureListContainer>
    </OurFeautures>

    <PartnersCta to="/partner">
        <p>Interested in partnering with us?</p>
       <StyledLinkButton onClick={handleGetInTouch} primary>
                  Build Online Campus
                </StyledLinkButton>
    
        </PartnersCta>
             {/* <Footer/> */}

  {/* <HeroImage /> */}
      </Hero>
  
      </Layout>
    </Container>
  );
}

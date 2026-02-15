import React from "react";
import { Layout, Container, StyledLinkButton, MobileOnboardingLinks, Hero, HeroHeading, HeroText, PageTitle, FeatureList, FeatureListContainer, OurFeautures, Overlay, PartnersCta} from "../components/shared/Layout";
import { useNavigate } from "react-router-dom";

export default function Partner() {
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
    <PageTitle>Brightway For Companies</PageTitle>
    <HeroHeading style={{lineHeight: '1'}}>Discover top talents, expand global reach, and create real-world impact globally.</HeroHeading>
    {/* <HeroSubtext>Brightway is an AI-driven ecosystem built to empower students, connect schools, and deliver opportunities through intelligent tools.</HeroSubtext> */}
  
</HeroText>
<MobileOnboardingLinks>
              <StyledLinkButton to="/signup" primary>Partner with us</StyledLinkButton>
</MobileOnboardingLinks>
    <OurFeautures>
                <FeatureListContainer>
                  <FeatureList>
                    <p>
                        <img src="/target.png" style={{width:"55px"}}/>
                    </p>
                    <p>Connect with skilled individuals ready to make an impact on your team..</p>
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
                        <img src="/light.png" style={{width:"55px"}}/>
                    </p>
                    <p>Empower learners and professionals to shape the future worldwide.</p>
                  </FeatureList>
                </FeatureListContainer>
    </OurFeautures>
     <PartnersCta to="/partner">
            <p>Interested in partnering with us?</p>
           <StyledLinkButton onClick={handleGetInTouch} primary>
                      Create Business Account
                    </StyledLinkButton>
        
            </PartnersCta>
             {/* <Footer/> */}

  {/* <HeroImage /> */}
      </Hero>
  
      </Layout>
    </Container>
  );
}

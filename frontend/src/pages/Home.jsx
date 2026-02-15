import { useState } from "react";
import LoginModal from "./LoginModal";
import SignupModals from "../components/signup/SignupModal";

import {
  Layout,
  Container,
  StyledLinkButton,
  MobileOnboardingLinks,
  Hero,
  HeroHeading,  
  HeroText,
  PageTitle,
  FeatureListContainer,
  FeatureList,
  OurFeautures,
  Overlay
} from "../components/shared/Layout";

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [showSignupStep1, setShowSignupStep1] = useState(false);

  return (
    <Container>
      <Layout activeTab="individuals">
        <Hero>
          <Overlay />

          <HeroText>
            <PageTitle>Welcome to Brightway</PageTitle>
            <HeroHeading style={{ lineHeight: "1" }}>
              The all-in-one ecosystem for learning, connection, career growth,
              and opportunities.
            </HeroHeading>
          </HeroText>

          <MobileOnboardingLinks>
            <StyledLinkButton as="button" onClick={() => setShowLogin(true)}>
              Login
            </StyledLinkButton>
            <StyledLinkButton as="button" onClick={() => setShowSignupStep1(true)} primary>
              Join for free
            </StyledLinkButton>
          </MobileOnboardingLinks>

          <OurFeautures>
            <FeatureListContainer>
              <FeatureList>
                <p>
                  <img src="/icons/books.png" style={{ width: "55px" }} />
                </p>
                <p>
                  Learn the skills that matter, gain practical experience, and
                  unlock your potential.
                </p>
              </FeatureList>
            </FeatureListContainer>

            <FeatureListContainer>
              <FeatureList>
                <p>
                  <img src="/icons/users1.png" style={{ width: "55px" }} />
                </p>
                <p>
                  Join a network of learners, mentors, employers, and schools.
                </p>
              </FeatureList>
            </FeatureListContainer>

            <FeatureListContainer>
              <FeatureList>
                <p>
                  <img src="/icons/work.png" style={{ width: "55px" }} />
                </p>
                <p>
                  Find the best internships, scholarships, and job placements.
                </p>
              </FeatureList>
            </FeatureListContainer>
          </OurFeautures>
        </Hero>

        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
        {showSignupStep1 && <SignupModals onClose={() => setShowSignupStep1(false)} />}
      </Layout>
    </Container>
  );
}

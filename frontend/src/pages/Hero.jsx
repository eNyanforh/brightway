import React from "react";
import styled from "styled-components";
import { StyledLinkButton } from "../components/shared/Layout"; // or your button component

const HeroSection = styled.section`
  display: flex;
  flex-wrap: wrap;
  padding-left: 2rem;
  align-items: center;
  background: ${({ bgImage }) => (bgImage ? `url(${bgImage})` : "none")};
  background-position: center;
  background-size: cover;
  height: 85vh;
  color: ${({ theme }) => theme.colors.white};

  @media (max-width: 1100px) {
    position: relative;
    height: 92vh;
    align-items: flex-start;
    justify-content: center;
    background-color: ${({ bgColor }) => bgColor || "rgba(231, 240, 251, 0.8)"};
    padding-left: 1rem;
  }
`;

const HeroText = styled.div`
  flex: 1;
  min-width: 300px;
  padding-right: 2rem;
  font-size: 1.2rem;

  @media (max-width: 1100px) {
    text-align: center;
    margin-top: 2rem;
    padding-right: 0;
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const HeroHeading = styled.h1`
  font-size: 3.75rem;
  font-weight: 800;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.primary};

  span.highlight {
    color: ${({ theme }) => theme.colors.neonCyan};
  }

  span.secondary {
    color: gray;
  }

  @media (max-width: 1100px) {
    font-size: 1.875rem;
  }
`;

const HeroSubtext = styled.p`
  margin-bottom: 3rem;
  font-size: 1.25rem;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.lightGrayText};

  @media (max-width: 1100px) {
    font-size: 0.9rem;
    font-weight: normal;
    margin-bottom: 1rem;
  }
`;

const CTAButtons = styled.div`
  display: flex;
  gap: 1rem;

  @media (max-width: 1100px) {
    justify-content: center;
    flex-direction: column;
    gap: 0.8rem;
  }
`;

const HeroImage = styled.div`
  flex: 1;
  min-width: 300px;
  height: 100%;
  background-image: ${({ img }) => (img ? `url(${img})` : "none")};
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  position: relative;
  top: 20px;
  left: 100px;

  @media (max-width: 1100px) {
    display: none;
  }
`;

export default function Hero({
  heading,
  subtext,
  bgImage,
  bgColor,
  image,
  ctaButtons = [],
}) {
  /**
   * ctaButtons is an array of objects like:
   * [{ text: "Login", to: "/login", primary: false }, { text: "Join", to: "/signup", primary: true }]
   */

  return (
    <HeroSection bgImage={bgImage} bgColor={bgColor}>
      <HeroText>
        <HeroHeading
          dangerouslySetInnerHTML={{ __html: heading }}
          // Use HTML to allow <span class="highlight"> or <span class="secondary">
        />
        <HeroSubtext>{subtext}</HeroSubtext>
        <CTAButtons>
          {ctaButtons.map(({ text, to, primary = false }, i) => (
            <StyledLinkButton key={i} to={to} primary={primary}>
              {text}
            </StyledLinkButton>
          ))}
        </CTAButtons>
      </HeroText>
      <HeroImage img={image} />
    </HeroSection>
  );
}

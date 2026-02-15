import React from "react";
import styled from "styled-components";

const Trust = styled.section`
  text-align: center;
  height:22vh;
  border-top:2px solid #e2e8f0;
background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: white;

  h2 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 2rem;
  }

  .logos {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 2rem;
    opacity: 0;
    animation: fadeIn 1s forwards;
    
    img {
      max-height: 60px;
      object-fit: contain;
      filter: brightness(0) invert(1); /* white logos */
      transition: transform 0.3s ease;

      &:hover {
        transform: scale(1.1);
      }
    }
  }

  @keyframes fadeIn {
    to { opacity: 1; }
  }
`;

const TrustSection = () => (
  <Trust>
    <h2>Trusted by Schools and Organizations Worldwide</h2>
    <div className="logos">
      <img src="/logo/brightwaylogo.png" alt="Logo 1" />
      <img src="/logos/logo2.png" alt="Logo 2" />
      <img src="/logos/logo3.png" alt="Logo 3" />
      <img src="/logos/logo4.png" alt="Logo 4" />
    </div>
  </Trust>
);

export default TrustSection;

import React from "react";
import styled from "styled-components";

const ProgressBarContainer = styled.div`
  width: 100%;
  background-color: #e5e5e5;
  height: 10px;
  border-radius: 20px;
  overflow: hidden;
  margin: 1rem 0;
`;

const ProgressFill = styled.div`
  height: 100%;
  width: ${({ percentage }) => percentage}%;
  background-color: #3b82f6;
  border-radius: 20px;
  transition: width 0.4s ease-in-out;
`;

export default function ProgressBar({ currentStep, totalSteps }) {
  const percentage = Math.floor((currentStep / totalSteps) * 100);

  return (
    <ProgressBarContainer>
      <ProgressFill percentage={percentage} />
    </ProgressBarContainer>
  );
}

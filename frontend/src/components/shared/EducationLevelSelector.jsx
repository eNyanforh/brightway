// components/shared/EducationLevelSelector.js

import React, { useState } from "react";
import styled from "styled-components";
import WarningMessage from "./WarningMessage";
import { NextButton } from "./NextButton";
import BackButton from "./BackButton";

export default function EducationLevelSelector({
  title,
  levelsData,
  defaultMain = "",
  onBack,
  onNext,
  formKeyMain = "educationLevel",
}) {
  const [selectedMain, setSelectedMain] = useState(defaultMain);
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!selectedMain) {
      setError("Please select your education level.");
    } else {
      setError("");
      onNext({ [formKeyMain]: selectedMain });
    }
  };

  return (
    <>
      <FormHeader>{title}</FormHeader>

      <OptionsWrapper>
        {Object.keys(levelsData).map((level) => (
          <MainButton
            key={level}
            className={selectedMain === level ? "selected" : ""}
            onClick={() => {
              setSelectedMain(level);
              setError("");
            }}
          >
            {level}
          </MainButton>
        ))}
      </OptionsWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={!selectedMain}>
        Next
      </NextButton>

      <BackButton onClick={onBack}>Back</BackButton>
    </>
  );
}

const FormHeader = styled.h2`
  font-size: 1.5rem;
  color: #1f2937;
  margin-bottom: 1rem;
`;

const OptionsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const MainButton = styled.button`
  padding: 0.8rem;
  border-radius: 30px;
  border: 2px solid rgba(217, 217, 217, 0.4);
  background-color: rgba(217, 217, 217, 0.4);
  color: #3b82f6;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    border-color: #e0e7ff;
    background-color: #e0e7ff;
  }

  &.selected {
    border-color: #3b82f6;
    background-color: #eff6ff;
  }
`;

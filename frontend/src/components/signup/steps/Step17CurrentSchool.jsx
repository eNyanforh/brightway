import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

export default function StepCurrentSchoolInfo({
  onNext,
  onBack,
  formData = {},
}) {
  const [schoolName, setSchoolName] = useState(formData.currentSchoolName || "");
  const [schoolLocation, setSchoolLocation] = useState(
    formData.currentSchoolLocation || ""
  );
  const [yearStarted, setYearStarted] = useState(
    formData.currentSchoolYearStarted || ""
  );
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!schoolName) {
      setError("Please enter your school name");
      return;
    }
    if (!schoolLocation) {
      setError("Please enter your school location");
      return;
    }
    if (!yearStarted) {
      setError("Please enter the year you started");
      return;
    }

    onNext({
      ...formData,
      currentSchoolName: schoolName,
      currentSchoolLocation: schoolLocation,
      currentSchoolYearStarted: yearStarted,
    });
  };

  return (
    <>
      <FormHeaderBlock
        title="Add current school"
        subtitle="Tell us where you are currently studying"
      />

      <InputWrapper>
        <Input
          type="text"
          placeholder="School name"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
        />
      </InputWrapper>

      <InputWrapper>
        <Input
          type="text"
          placeholder="School location"
          value={schoolLocation}
          onChange={(e) => setSchoolLocation(e.target.value)}
        />
      </InputWrapper>

      <InputWrapper>
        <Input
          type="number"
          placeholder="Year started"
          value={yearStarted}
          onChange={(e) => setYearStarted(e.target.value)}
        />
      </InputWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext}>Next</NextButton>
      <BackButton onClick={onBack}>Back</BackButton>
    </>
  );
}

/* ---------- Styled Components ---------- */

const InputWrapper = styled.div`
  width: 100%;
  max-width: 380px;
  margin: 1rem 0;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1.5px solid #d1d5db;
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: #eff6ff;
  }
`;

import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

export default function Step18HighestSchool({
  onNext,
  onBack,
  formData = {},
}) {
  const [schoolName, setSchoolName] = useState(
    formData.highestSchoolName || ""
  );
  const [schoolLocation, setSchoolLocation] = useState(
    formData.highestSchoolLocation || ""
  );
  const [yearCompleted, setYearCompleted] = useState(
    formData.highestSchoolYearCompleted || ""
  );
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!schoolName) {
      setError("Please enter the school name");
      return;
    }

    if (!schoolLocation) {
      setError("Please enter the school location");
      return;
    }

    if (!yearCompleted) {
      setError("Please enter the year completed");
      return;
    }

    onNext({
      ...formData,
      highestSchoolName: schoolName,
      highestSchoolLocation: schoolLocation,
      highestSchoolYearCompleted: yearCompleted,
    });
  };

  return (
    <>
      <FormHeaderBlock
        title="School of your highest education"
        subtitle="Where did you complete your highest level of education?"
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
          placeholder="Year completed"
          value={yearCompleted}
          onChange={(e) => setYearCompleted(e.target.value)}
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

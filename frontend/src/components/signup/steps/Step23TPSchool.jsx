import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

export default function Step23TPSchool({
  onNext,
  onBack,
  formData = {}, // ✅ SAFE DEFAULT
}) {
  const [schoolName, setSchoolName] = useState(
    formData.techProfessionalSchoolName || ""
  );
  const [schoolLocation, setSchoolLocation] = useState(
    formData.techProfessionalSchoolLocation || ""
  );
  const [yearStarted, setYearStarted] = useState(
    formData.techProfessionalSchoolYearStarted || ""
  );
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!schoolName) {
      setError("Please enter the name of the technical or professional school");
      return;
    }
    if (!schoolLocation) {
      setError("Please enter the school location");
      return;
    }
    if (!yearStarted) {
      setError("Please enter the year you started");
      return;
    }

    onNext({
      ...formData,
      techProfessionalSchoolName: schoolName,
      techProfessionalSchoolLocation: schoolLocation,
      techProfessionalSchoolYearStarted: yearStarted,
    });
  };

  return (
    <>
      <FormHeaderBlock
        title="Add technical or professional school"
        subtitle="Tell us about the technical or professional training you are currently pursuing"
      />

      <InputWrapper>
        <Input
          type="text"
          placeholder="School or training center name"
          value={schoolName}
          onChange={(e) => {
            setSchoolName(e.target.value);
            setError("");
          }}
        />
      </InputWrapper>

      <InputWrapper>
        <Input
          type="text"
          placeholder="School location"
          value={schoolLocation}
          onChange={(e) => {
            setSchoolLocation(e.target.value);
            setError("");
          }}
        />
      </InputWrapper>

      <InputWrapper>
        <Input
          type="number"
          placeholder="Year started"
          value={yearStarted}
          onChange={(e) => {
            setYearStarted(e.target.value);
            setError("");
          }}
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

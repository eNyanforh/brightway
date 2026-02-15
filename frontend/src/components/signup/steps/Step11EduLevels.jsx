import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

const EDUCATION_OPTIONS = [
  
  { label: "Currently in High School", value: "high_school" },
  { label: "Currently in an Associate Program", value: "associate" },
  { label: "Currently in a Bachelor’s Program", value: "bachelor" },
  { label: "Currently in a Master’s Program", value: "master" },
  { label: "Currently in a Doctoral Program (PhD)", value: "phd" },
];

export default function Step11EduLevels({
  onNext,
  onBack,
  formData = {}, // ✅ SAFE DEFAULT
}) {
  const [currentLevel, setCurrentLevel] = useState(
    formData.currentEducationLevel || ""
  );
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!currentLevel) {
      setError("Please select your current level of education");
      return;
    }

    onNext({
      ...formData,
      currentEducationLevel: currentLevel, // ✅ single source of truth
    });
  };

  return (
    <>
      <FormHeaderBlock title="What is your current level of formal education?" />

      <SelectWrapper>
        <Select
          value={currentLevel}
          onChange={(e) => {
            setCurrentLevel(e.target.value);
            setError("");
          }}
        >
          <option value="">Select an option</option>
          {EDUCATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </SelectWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={!currentLevel}>
        Next
      </NextButton>

      <BackButton onClick={onBack}>Back</BackButton>
    </>
  );
}

/* ---------- Styled Components ---------- */

const SelectWrapper = styled.div`
  width: 100%;
  max-width: 380px;
  margin: 1.5rem 0;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1.5px solid #d1d5db;
  font-size: 1rem;
  background-color: #fff;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: #eff6ff;
  }
`;

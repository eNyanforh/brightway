import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

const HIGHEST_EDUCATION_OPTIONS = [
  
  { label: "No Formal Education", value: "none" },
  {label: "Junior School Diploma", value:"jr_school"},
  { label: "High School Diploma", value: "high_school" },
  { label: "Associate Degree", value: "associate" },
  { label: "Bachelor’s Degree", value: "bachelor" },
  { label: "Master’s Degree", value: "master" },
  { label: "Doctoral Degree (PhD)", value: "phd" },
  { label: "Professional Certification / Diploma", value: "certificate" },
];

export default function Step12HighestEdu({ onNext, onBack, formData = {} }) {
  const [highestLevel, setHighestLevel] = useState(formData.highestEducationLevel || "");
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!highestLevel) {
      setError("Please select your highest level of education");
      return;
    }

    onNext({
      ...formData,
      highestEducationLevel: highestLevel,
    });
  };

  return (
    <>
      <FormHeaderBlock title="What is your highest level of formal education?" />

      <SelectWrapper>
        <Select
          value={highestLevel}
          onChange={(e) => {
            setHighestLevel(e.target.value);
            setError("");
          }}
        >
          <option value="">Select an option</option>
          {HIGHEST_EDUCATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </SelectWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={!highestLevel}>
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

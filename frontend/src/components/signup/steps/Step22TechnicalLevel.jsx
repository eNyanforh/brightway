import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

/* ---------- Options ---------- */

const TECH_PRO_EDU_OPTIONS = [
  {
    label: "No technical or professional training yet",
    value: "none",
  },
  {
    label: "Currently enrolled in technical training",
    value: "technical_in_progress",
  },
  {
    label: "Completed technical certification or diploma",
    value: "technical_completed",
  },
  {
    label: "Currently enrolled in professional training",
    value: "professional_in_progress",
  },
  {
    label: "Licensed or certified professional",
    value: "professional_certified",
  },
  {
    label: "Ongoing professional development (CPD)",
    value: "cpd",
  },
];

/* ---------- Component ---------- */

export default function Step22TechProfessionalEducation({
  onNext,
  onBack,
  formData = {}, // ✅ SAFE DEFAULT
}) {
  const [educationLevel, setEducationLevel] = useState(
    formData.techProfessionalEducation || ""
  );
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!educationLevel) {
      setError(
        "Please select your current level of technical or professional education"
      );
      return;
    }

    onNext({
      ...formData,
      techProfessionalEducation: educationLevel, // ✅ single source of truth
    });
  };

  return (
    <>
      <FormHeaderBlock
        title="What's your current level of technical or professional education?"
        subTitle="Include vocational, technical, or professional training outside of academic degrees."
      />

      <SelectWrapper>
        <Select
          value={educationLevel}
          onChange={(e) => {
            setEducationLevel(e.target.value);
            setError("");
          }}
        >
          <option value="">Select an option</option>
          {TECH_PRO_EDU_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </SelectWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={!educationLevel}>
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

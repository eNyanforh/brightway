import { useState, useEffect } from "react";
import ProgressBar from "../../shared/ProgressBar";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import WarningMessage from "../../shared/WarningMessage";
import BackButton from "../../shared/BackButton";
import styled from "styled-components";

export default function Step5Gender({
  onNext,
  onBack,
  formData = {}, // ✅ Option 1: safe default
}) {
  const [gender, setGender] = useState(formData.gender || "");
  const [warning, setWarning] = useState("");
  const [isValid, setIsValid] = useState(false);

  // Validate dynamically
  useEffect(() => {
    setIsValid(
      gender !== "" &&
      gender !== "Select your Gender"
    );
  }, [gender]);

  const handleNext = () => {
    if (!isValid) {
      setWarning("Please select your gender.");
      return;
    }

    setWarning("");
    onNext({ ...formData, gender });
  };

  // Handle Enter key submission
  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (isValid) handleNext();
      }
    };

    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [isValid, gender]);

  return (
    <>
      <FormHeaderBlock title="What's your gender?" />
      <ProgressBar currentStep={5} totalSteps={7} />

      <SelectContainer>
        <GenderSelect
          value={gender}
          onChange={(e) => {
            setGender(e.target.value);
            setWarning("");
          }}
          className={gender ? "selected" : ""}
        >
          <option value="Select your Gender">
            Select your Gender
          </option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Non-binary">Non-binary</option>
          <option value="Prefer not to say">Prefer not to say</option>
          <option value="Other">Other</option>
        </GenderSelect>

        <DropdownIcon>
          <svg
            width="12"
            height="8"
            viewBox="0 0 12 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1L6 6L11 1"
              stroke="#495057"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </DropdownIcon>
      </SelectContainer>

      {warning && <WarningMessage message={warning} />}

      <NextButton onClick={handleNext} disabled={!isValid}>
        Next
      </NextButton>

      <BackButton onClick={onBack}>
        Back
      </BackButton>
    </>
  );
}

/* =========================
   Styled Components
   ========================= */

const SelectContainer = styled.div`
  position: relative;
  margin: 1.5rem 0;
  width: 100%;
`;

const GenderSelect = styled.select`
  width: 100%;
  padding: 0.75rem 2.5rem 0.75rem 1rem;
  border-radius: 30px;
  border: 1.5px solid #ccc;
  font-size: 1rem;
  font-weight: 600;
  font-family: "Inter", sans-serif;
  color: gray;
  background-color: rgba(217, 217, 217, 0.3);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.08);
  appearance: none;
  cursor: pointer;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: #eff6ff;
    color: black;
  }

  &.selected {
    color: black;
  }

  option {
    background: white;
    color: #333;
  }
`;

const DropdownIcon = styled.div`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
`;

import { useState, useEffect } from "react";
import { FaUserGraduate, FaBriefcase, FaUserTie } from "react-icons/fa";
import ProgressBar from "../../shared/ProgressBar";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import WarningMessage from "../../shared/WarningMessage";
import BackButton from "../../shared/BackButton";
import styled from "styled-components";

export default function Signup24UserRole({ onNext, onBack, formData = {} }) {
  const [role, setRole] = useState(formData.role || "");
  const [warning, setWarning] = useState("");
  const [isValid, setIsValid] = useState(false);

  // Validate dynamically
  useEffect(() => {
    setIsValid(role !== "");
  }, [role]);

  const handleNext = () => {
    if (!isValid) {
      setWarning("Please select your role.");
      return;
    }

    setWarning("");
    onNext({ ...formData, role });
  };

  // Handle Enter key submission
  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter" && isValid) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [isValid, role]);

  const roles = [
    { name: "Student", icon: <FaUserGraduate /> },
    { name: "Professional", icon: <FaBriefcase /> },
    { name: "Both", icon: <FaUserTie /> },
  ];

  return (
    <>
      <FormHeaderBlock title="What's your role?" />
      <ProgressBar currentStep={5} totalSteps={7} />

      <ButtonGroup>
        {roles.map((r) => (
          <RoleButton
            key={r.name}
            selected={role === r.name}
            onClick={() => {
              setRole(r.name);
              setWarning("");
            }}
          >
            <IconWrapper>{r.icon}</IconWrapper>
            {r.name}
          </RoleButton>
        ))}
      </ButtonGroup>

      {warning && <WarningMessage message={warning} />}

      <NextButton onClick={handleNext} disabled={!isValid}>
        Next
      </NextButton>

      <BackButton onClick={onBack}>Back</BackButton>
    </>
  );
}

/* =========================
   Styled Components
   ========================= */

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column; /* vertical */
  gap: 1rem;
  margin: 1.5rem 0;
`;

const RoleButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 30px;
  border: 1.5px solid ${({ selected }) => (selected ? "#3b82f6" : "#ccc")};
  background-color: ${({ selected }) => (selected ? "#3b82f6" : "rgba(217,217,217,0.3)")};
  color: ${({ selected }) => (selected ? "white" : "#333")};
  font-weight: 600;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;

  &:hover {
    border-color: #3b82f6;
    background-color: ${({ selected }) => (selected ? "#3b82f6" : "#dbeafe")};
  }
`;

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  font-size: 1.2rem;
`;

import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

const CAREER_OPTIONS = [
  "Accountant",
  "Actor",
  "Architect",
  "Artist",
  "Auditor",
  "Business Analyst",
  "Civil Engineer",
  "Data Scientist",
  "Dentist",
  "Doctor",
  "Economist",
  "Engineer",
  "Entrepreneur",
  "Financial Analyst",
  "Graphic Designer",
  "HR Specialist",
  "Lawyer",
  "Marketing Manager",
  "Mechanical Engineer",
  "Nurse",
  "Pharmacist",
  "Project Manager",
  "Software Engineer",
  "Teacher",
  "UX Designer",
  "Web Developer",
  "Writer",
  "Researcher",
  "Consultant",
  "Freelancer",
  // Add more careers here
];

export default function StepCareerAmbition({ onNext, onBack, formData = {} }) {
  const [query, setQuery] = useState(formData.careerAmbition || "");
  const [selectedCareer, setSelectedCareer] = useState(formData.careerAmbition || "");
  const [error, setError] = useState("");

  // Filter options based on input query
  const filteredOptions = CAREER_OPTIONS.filter(
    (career) =>
      career.toLowerCase().includes(query.toLowerCase()) &&
      career !== selectedCareer // hide already selected option
  );

  const handleSelect = (career) => {
    setSelectedCareer(career);
    setQuery(career);
    setError("");
  };

  const handleNext = () => {
    if (!selectedCareer) {
      setError("Please select your career ambition to continue");
      return;
    }

    onNext({
      ...formData,
      careerAmbition: selectedCareer,
    });
  };

  return (
    <>
      <FormHeaderBlock title="What do you want to become?" />

      <InputWrapper>
        <SearchInput
          type="text"
          placeholder="Example: Doctor"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedCareer(""); // reset selected if user types again
          }}
        />

        {/* Show dropdown only if user starts typing and hasn't selected exact match */}
        {query && !selectedCareer && filteredOptions.length > 0 && (
          <Dropdown>
            {filteredOptions.map((career) => (
              <DropdownItem key={career} onClick={() => handleSelect(career)}>
                {career}
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </InputWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={!selectedCareer}>
        Next
      </NextButton>
      <BackButton onClick={onBack}>Back</BackButton>
    </>
  );
}

/* ---------- Styled Components ---------- */
const InputWrapper = styled.div`
  width: 100%;
  max-width: 380px;
  position: relative;
  margin: 1.5rem 0;
`;

const SearchInput = styled.input`
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

const Dropdown = styled.ul`
  position: absolute;
  width: 100%;
  max-height: 180px;
  overflow-y: auto;
  background: #fff;
  border: 1.5px solid #d1d5db;
  border-top: none;
  border-radius: 0 0 10px 10px;
  z-index: 100;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const DropdownItem = styled.li`
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #f0f9ff;
  }
`;

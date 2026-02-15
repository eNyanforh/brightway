import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

// Profession options
const PROFESSION_OPTIONS = [
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
  // Add more professions here
];

export default function Step14Professions({ onNext, onBack, formData = {} }) {
  const [query, setQuery] = useState(formData.profession || "");
  const [selectedProfession, setSelectedProfession] = useState(formData.profession || "");
  const [noProfession, setNoProfession] = useState(formData.noProfession || false);
  const [error, setError] = useState("");

  // Filter options based on input
  const filteredOptions = PROFESSION_OPTIONS.filter(
    (profession) =>
      profession.toLowerCase().includes(query.toLowerCase()) &&
      profession !== selectedProfession
  );

  const handleSelect = (profession) => {
    setSelectedProfession(profession);
    setQuery(profession);
    setNoProfession(false); // uncheck "don't have a profession" if user selects
    setError("");
  };

  const handleNext = () => {
    if (!selectedProfession && !noProfession) {
      setError("Please select your profession or check 'I don't have a profession yet'");
      return;
    }

    onNext({
      ...formData,
      profession: selectedProfession,
      noProfession,
    });
  };

  return (
    <>
      <FormHeaderBlock title="What's your profession?" />

      <InputWrapper>
        <SearchInput
          type="text"
          placeholder="Start typing your profession..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedProfession(""); // Reset selection if user types again
            setNoProfession(false); // uncheck if typing
          }}
          disabled={noProfession} // disable input if user checked "no profession"
        />

        {/* Show dropdown only when typing and no selection */}
        {query && !selectedProfession && !noProfession && filteredOptions.length > 0 && (
          <Dropdown>
            {filteredOptions.map((profession) => (
              <DropdownItem
                key={profession}
                onClick={() => handleSelect(profession)}
              >
                {profession}
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </InputWrapper>

      <CheckboxWrapper>
        <label>
          <input
            type="checkbox"
            checked={noProfession}
            onChange={(e) => {
              setNoProfession(e.target.checked);
              if (e.target.checked) {
                setSelectedProfession("");
                setQuery("");
                setError("");
              }
            }}
          />{" "}
          I don't have a profession yet
        </label>
      </CheckboxWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={!selectedProfession && !noProfession}>
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

const CheckboxWrapper = styled.div`
  margin-top: 1rem;
  font-size: 0.95rem;

  input {
    margin-right: 0.5rem;
  }
`;

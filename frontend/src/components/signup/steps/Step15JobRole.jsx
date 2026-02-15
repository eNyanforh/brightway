import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

// Job/Role options for a company
const JOB_ROLE_OPTIONS = [
"Self Employ",
  "Accountant",
  "Actor",
  "Architect",
  "Artist",
  "Auditor",
  "Business Analyst",
  "Civil Engineer",
  "Chief Executive Officer",
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
  // Add more company job roles as needed
];

export default function Step15JobRole({ onNext, onBack, formData = {} }) {
  const [query, setQuery] = useState(formData.jobRole || "");
  const [selectedJobRole, setSelectedJobRole] = useState(formData.jobRole || "");
  const [noJobRole, setNoJobRole] = useState(formData.noJobRole || false);
  const [error, setError] = useState("");

  // Filter options as user types
  const filteredOptions = JOB_ROLE_OPTIONS.filter(
    (role) =>
      role.toLowerCase().includes(query.toLowerCase()) &&
      role !== selectedJobRole
  );

  const handleSelect = (role) => {
    setSelectedJobRole(role);
    setQuery(role);
    setNoJobRole(false); // uncheck if selecting a role
    setError("");
  };

  const handleNext = () => {
    if (!selectedJobRole && !noJobRole) {
      setError("Please select your job/role or check 'I don't have a job yet'");
      return;
    }

    onNext({
      ...formData,
      jobRole: selectedJobRole,
      noJobRole,
    });
  };

  return (
    <>
      <FormHeaderBlock title="What's your current job?" />
      <InputWrapper>
        <SearchInput
          type="text"
          placeholder="Start typing your job/role..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedJobRole("");
            setNoJobRole(false);
          }}
          disabled={noJobRole}
        />

        {query && !selectedJobRole && !noJobRole && filteredOptions.length > 0 && (
          <Dropdown>
            {filteredOptions.map((role) => (
              <DropdownItem key={role} onClick={() => handleSelect(role)}>
                {role}
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </InputWrapper>

      <CheckboxWrapper>
        <label>
          <input
            type="checkbox"
            checked={noJobRole}
            onChange={(e) => {
              setNoJobRole(e.target.checked);
              if (e.target.checked) {
                setSelectedJobRole("");
                setQuery("");
                setError("");
              }
            }}
          />{" "}
          I don't have a job yet
        </label>
      </CheckboxWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={!selectedJobRole && !noJobRole}>
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

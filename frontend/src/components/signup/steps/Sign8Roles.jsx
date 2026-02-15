import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import WarningMessage from "../../shared/WarningMessage";
import BackButton from "../../shared/BackButton";
import { User, Briefcase, Search } from "lucide-react"; // ✅ Real icons

export default function SignupRoleStep({ onNext, onBack, formData = {} }) {
  const [roles, setRoles] = useState(formData.roles || []);
  const [error, setError] = useState("");

  const toggleRole = (value) => {
    setRoles((prev) =>
      prev.includes(value)
        ? prev.filter((r) => r !== value)
        : [...prev, value]
    );
    setError("");
  };

  const handleNext = () => {
    if (roles.length === 0) {
      setError("Please select at least one option to continue");
      return;
    }

    onNext({
      ...formData,
      roles,
    });
  };

  return (
    <>
      <FormHeaderBlock
        title="What best describes you?"
        subTitle="Select all that apply"
      />

      <Options>
        {ROLE_OPTIONS.map((option) => (
          <li
            key={option.value}
            className={roles.includes(option.value) ? "selected" : ""}
            onClick={() => toggleRole(option.value)}
          >
            <div className="option-title">
              <span className="icon">{option.icon}</span> {option.label}
            </div>
            <div className="option-description">{option.description}</div>
          </li>
        ))}
      </Options>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={roles.length === 0}>
        Next
      </NextButton>

    </>
  );
}

/* ---------- Role Options with Icons ---------- */
const ROLE_OPTIONS = [
  {
    label: "Learner / Student",
    value: "learner",
    icon: <User size={20} />, // Lucide User icon
    description:
      "Learning, studying, or building skills",
  },
  {
    label: "Professional",
    value: "professional",
    icon: <Briefcase size={20} />, // Lucide Briefcase icon
    description:
      "Working or seeking job",
  },
  {
    label: "Recruiter / Employer",
    value: "recruiter",
    icon: <Search size={20} />, // Lucide Search icon
    description:
      "Hiring impactful talents",
  },
];

/* ---------- Styled Components ---------- */
const Options = styled.ul`
  list-style: none;
  padding: 0;
  width: 100%;
  max-width: 380px;

  li {
    padding: 1rem;
    margin-bottom: 0.75rem;
    border-radius: 10px;
    border: 1.5px solid #ddd;
    cursor: pointer;
    transition: all 0.2s ease;
    background: #fff;
  }

  li:hover {
    background: #f8fafc;
  }

  li.selected {
    background: #e0f2fe;
    border-color: blue;
    color:black;
  }

  .option-title {
    font-weight: 700;
    font-size: 1rem;
    color: #111;
    display: flex;
    align-items: center;
  }

  .icon {
    margin-right: 0.5rem;
    display: flex;
    align-items: center;
  }

  .option-description {
    margin-top: 0.35rem;
    font-size: 0.85rem;
    line-height: 1.4;
    color: #555;
  }

  li.selected .option-title,
  li.selected .option-description {
    color: black
  }
`;

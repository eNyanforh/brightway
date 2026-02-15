import React, { useState } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

export default function Step16CompanyInfo({ onNext, onBack, formData = {} }) {
  const [companyName, setCompanyName] = useState(formData.companyName || "");
  const [companyLocation, setCompanyLocation] = useState(formData.companyLocation || "");
  const [yearJoined, setYearJoined] = useState(formData.yearJoined || "");
  const [isFreelancer, setIsFreelancer] = useState(formData.isFreelancer || false);
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!companyName && !isFreelancer) {
      setError("Please enter your company name or check 'I am a freelancer'");
      return;
    }

    if (!companyLocation && !isFreelancer) {
      setError("Please enter your company location");
      return;
    }

    if (!yearJoined && !isFreelancer) {
      setError("Please enter the year you joined");
      return;
    }

    onNext({
      ...formData,
      companyName,
      companyLocation,
      yearJoined,
      isFreelancer,
    });
  };

  return (
    <>
      <FormHeaderBlock title="Your current job information" />

      {/* Company Name */}
      <InputWrapper>
        <SearchInput
          type="text"
          placeholder="Company Name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isFreelancer}
        />
      </InputWrapper>

      {/* Company Location */}
      <InputWrapper>
        <SearchInput
          type="text"
          placeholder="Company Location"
          value={companyLocation}
          onChange={(e) => setCompanyLocation(e.target.value)}
          disabled={isFreelancer}
        />
      </InputWrapper>

      {/* Year Joined */}
      <InputWrapper>
        <SearchInput
          type="number"
          placeholder="Year Joined"
          value={yearJoined}
          onChange={(e) => setYearJoined(e.target.value)}
          disabled={isFreelancer}
        />
      </InputWrapper>

      {/* Freelancer Checkbox */}
      <CheckboxWrapper>
        <label>
          <input
            type="checkbox"
            checked={isFreelancer}
            onChange={(e) => {
              setIsFreelancer(e.target.checked);
              if (e.target.checked) {
                setCompanyName("");
                setCompanyLocation("");
                setYearJoined("");
                setError("");
              }
            }}
          />
          I am a freelancer
        </label>
      </CheckboxWrapper>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton
        onClick={handleNext}
        disabled={!companyName && !isFreelancer}
      >
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
  margin: 1rem 0;
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

const CheckboxWrapper = styled.div`
  margin-top: 0.75rem;
  font-size: 0.95rem;

  input {
    margin-right: 0.5rem;
  }
`;

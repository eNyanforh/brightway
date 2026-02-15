import React, { useState } from "react";
import { Hero, FormContainer } from "../components/shared/FormLayout";
import FormHeaderBlock from "../components/shared/FormHeaderBlock";
import { NextButton } from "../components/shared/NextButton";
import BackButton from "../components/shared/BackButton";
import WarningMessage from "../components/shared/WarningMessage";
import styled from "styled-components";

export default function SignupStepBio({ onNext, onBack, formData }) {
  const [bio, setBio] = useState(formData.bio || "");
  const [error, setError] = useState("");

  const handleNext = () => {
    if (!bio.trim()) {
      setError("Please enter a short bio.");
    } else {
      setError("");
      onNext({ ...formData, bio });
    }
  };

  return (
    <Hero>
      <FormContainer>
        <FormHeaderBlock title="Write a short bio about yourself" />
        <HelperText>
          Let employers and schools know more about you — your interests, goals, or passion.
        </HelperText>

        <TextArea
          rows={5}
          value={bio}
          placeholder="Example: I'm a student passionate about technology and open to internship opportunities."
          onChange={(e) => setBio(e.target.value)}
        />

        {error && <WarningMessage>{error}</WarningMessage>}

        <NextButton onClick={handleNext} disabled={!bio.trim()}>
          Next
        </NextButton>
        <BackButton onClick={onBack}>Back</BackButton>
      </FormContainer>
    </Hero>
  );
}

const TextArea = styled.textarea`
  width: 100%;
  padding: 1rem;
  font-size: 1rem;
  border-radius: 12px;
  border: 1.5px solid #ccc;
  margin-top: 1rem;
  resize: vertical;
`;

const HelperText = styled.p`
  margin-top: 0.5rem;
  color: #6B7280;
  font-size: 0.875rem;
`;

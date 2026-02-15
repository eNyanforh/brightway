import React, { useState } from "react"; 
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";

export default function Step10Interest({ onNext, onBack, formData = {} }) {
  const [selectedInterests, setSelectedInterests] = useState(
    Array.isArray(formData.interests) ? formData.interests : []
  );
  const [error, setError] = useState("");

  const interestsOptions = [
    "Technology", "Innovation", "Artificial Intelligence",
    "Education", "Learning",
    "Business", "Careers", "Entrepreneurship",
    "Creativity", "Media",
    "Science", "Health",
    "Social Impact", "Climate Change",
  ];

  const toggleInterest = (interest) => {
    setError("");

    if (selectedInterests.includes(interest)) {
      setSelectedInterests((prev) =>
        prev.filter((item) => item !== interest)
      );
    } else {
      setSelectedInterests((prev) => [...prev, interest]);
    }
  };

  const handleNext = () => {
    if (selectedInterests.length < 4) {
      setError("Please select at least 4 interests.");
      return;
    }

    onNext({
      ...formData,
      interests: selectedInterests,
    });
  };

  return (
    <>
      <FormHeaderBlock
        title="What are you interested in?"
        subtitle="Select at least 4 topics you care about. This helps personalize your experience."
      />

      <InterestsGrid>
        {interestsOptions.map((interest) => {
          const isSelected = selectedInterests.includes(interest);

          return (
            <InterestChip
              key={interest}
              selected={isSelected}
              onClick={() => toggleInterest(interest)}
            >
              {interest}
            </InterestChip>
          );
        })}
      </InterestsGrid>

      {error && <WarningMessage>{error}</WarningMessage>}

      <NextButton onClick={handleNext} disabled={selectedInterests.length < 4}>
        Next
      </NextButton>

      <BackButton onClick={onBack}>Back</BackButton>
    </>
  );
}

/* ---------- Styled Components ---------- */

const InterestsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 1.5rem 0;
  max-width: 520px;
`;

const InterestChip = styled.button`
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  font-size: 0.9rem;
  border: 1.5px solid
    ${(props) => (props.selected ? "#3b82f6" : "#d1d5db")};
  background-color: ${(props) =>
    props.selected ? "#e0f2fe" : "#ffffff"};
  color: #111827;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${(props) =>
      props.selected ? "#bae6fd" : "#f9fafb"};
  }
`;

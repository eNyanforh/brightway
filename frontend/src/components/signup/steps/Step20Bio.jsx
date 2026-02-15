import React, { useState, useEffect } from "react";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";
import styled from "styled-components";

export default function Step20Bio({ onNext, onBack, formData }) {
  const [bio, setBio] = useState(formData.bio || "");
  const [error, setError] = useState("");

  const wordCount = bio.trim() ? bio.trim().split(/\s+/).length : 0;

  const handleNext = () => {
    if (!bio.trim()) {
      setError("Please enter a short bio.");
    } else if (wordCount < 10) {
      setError("Your bio must be at least 10 words.");
    } else {
      setError("");
      onNext({ ...formData, bio });
    }
  };

  // Trigger Next on Enter key if bio is valid
  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter" && wordCount >= 10) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [bio, wordCount]);

  return (
    <>
     
        <FormHeaderBlock
          title="Write a short bio about yourself"
          subTitle={
            <>
              Share your background, interests, and goals.{" "}
              <strong>Minimum: 10 words.</strong>
            </>
          }
        />

        <TextArea
          rows={6}
          value={bio}
          placeholder="Example: I'm a student passionate about technology, learning software engineering..."
          onChange={(e) => setBio(e.target.value)}
        />

        <WordCount>{wordCount} / 10 words</WordCount>

        {error && <WarningMessage>{error}</WarningMessage>}

        <NextButton onClick={handleNext} disabled={wordCount < 10}>
          Continue
        </NextButton>
        <BackButton onClick={onBack}>Back</BackButton>
      
    </>
  );
}

// Styled Components
const TextArea = styled.textarea`
  width: 100%;
  padding: 1rem;
  font-size: 1rem;
  border-radius: 12px;
  border: 1.5px solid #ccc;
  margin-top: 1rem;
  resize: vertical;
  line-height: 1.6;
`;

const WordCount = styled.p`
  text-align: right;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #6b7280;
`;

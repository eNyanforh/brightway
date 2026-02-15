import React, { useState, useEffect } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";

export default function Step7Agreement({ formData = {}, onNext }) {
  const [agreed, setAgreed] = useState(false);

  const handleNext = () => {
    if (!agreed) {
      alert("You must agree to the terms before continuing.");
      return;
    }

    onNext({ agreedToTerms: true });
  };

  // Allow Enter key to proceed
  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter" && agreed) {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [agreed]);

  return (
    <>
      <FormHeaderBlock title="Agreement of Submission" />

      <AgreementText>
        By continuing, I confirm that the information provided is accurate and I
        agree to Brightway’s terms of service, privacy policy, and community
        guidelines.
      </AgreementText>

      <CheckboxWrapper>
        <input
          type="checkbox"
          checked={agreed}
          onChange={() => setAgreed(!agreed)}
          id="agreement"
        />
        <label htmlFor="agreement">I agree to the terms and conditions</label>
      </CheckboxWrapper>

      <NextButton disabled={!agreed} onClick={handleNext}>
        Continue
      </NextButton>
    </>
  );
}

/* ---------- Styles ---------- */

const AgreementText = styled.p`
  font-size: 0.95rem;
  color: #000;
  padding: 1rem;
  margin-bottom: 1rem;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  line-height: 1.5;
  max-width: 350px;
  font-weight: 600;
  text-align: center;
`;

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
  font-weight: 600;

  input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  label {
    cursor: pointer;
  }
`;

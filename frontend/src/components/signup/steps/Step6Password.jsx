// pages/SignupStep6.js
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import ProgressBar from "../../shared/ProgressBar";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import WarningMessage from "../../shared/WarningMessage";
import PasswordInputField from "../../shared/PasswordInputField";
import PasswordStrengthBar from "../../shared/PasswordStrengthBar";

export default function Step6Password({ onNext, onBack, formData }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordWarning, setPasswordWarning] = useState("");
  const [confirmWarning, setConfirmWarning] = useState("");

  // Real-time validation for password rules
  useEffect(() => {
    if (!password) {
      setPasswordWarning("");
      return;
    }
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&()_\-#]).{8,}$/;
    setPasswordWarning(
      regex.test(password)
        ? ""
        : "Password must be 8+ characters and include uppercase, lowercase, number, and symbol."
    );
  }, [password]);

  // Confirm password match validation
  useEffect(() => {
    if (!confirmPassword) {
      setConfirmWarning("");
      return;
    }
    setConfirmWarning(
      confirmPassword === password ? "" : "Passwords do not match"
    );
  }, [confirmPassword, password]);

  const canProceed =
    password && confirmPassword && !passwordWarning && !confirmWarning;

  const handleNext = () => {
    if (canProceed) {
      onNext({ ...formData, password });
    }
  };

  useEffect(() => {
  const handleEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (canProceed) handleNext();
    }
  };

  window.addEventListener("keydown", handleEnter);
  return () => window.removeEventListener("keydown", handleEnter);
}, [password, confirmPassword, passwordWarning, confirmWarning, canProceed]);


  return (
   <>
        <FormHeaderBlock title="Set your password" />
        <ProgressBar currentStep={6} totalSteps={7} />

        <PasswordWrapper>
          <PasswordInputField
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </PasswordWrapper>

        <PasswordStrengthBar password={password} />

        {passwordWarning && <WarningMessage message={passwordWarning} />}

        <PasswordWrapper>
          <PasswordInputField
            placeholder="Re-type your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </PasswordWrapper>

        {confirmWarning && <WarningMessage message={confirmWarning} />}

        <NextButton disabled={!canProceed} onClick={handleNext}>
          Next
        </NextButton>

        <BackButton onClick={onBack}>Back</BackButton>
     </>
  );
}

// Styles for wrappers and positioning (if needed)
const PasswordWrapper = styled.div`
  margin-top: 0.8rem;
  width: 100%;
  max-width: 350px;
`;

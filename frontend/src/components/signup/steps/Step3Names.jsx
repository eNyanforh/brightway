import React, { useState, useEffect } from "react";
import ProgressBar from "../../shared/ProgressBar";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import TextInputField from "../../shared/TextInputField";
import WarningMessage from "../../shared/WarningMessage";

export default function Step3Name({
  onNext,
  formData = {}, // ✅ REQUIRED defensive default
}) {
  const [firstName, setFirstName] = useState(formData.firstName || "");
  const [middleName, setMiddleName] = useState(formData.middleName || "");
  const [lastName, setLastName] = useState(formData.lastName || "");
  const [warning, setWarning] = useState("");
  const [isValid, setIsValid] = useState(false);

  const isValidName = (name) => {
    const nameRegex = /^[a-zA-Z\s'-]{2,}$/;
    const fakeNames = ["test", "admin", "abc", "asdf", "qwerty", "xxx"];
    if (!nameRegex.test(name)) return false;
    if (fakeNames.includes(name.toLowerCase())) return false;
    if (/^(.)\1{2,}$/.test(name)) return false;
    return true;
  };

  const isValidOptionalName = (name) => {
    if (!name) return true;
    return /^[A-Za-z.\s'-]+$/.test(name) && !/\d/.test(name);
  };

  // Dynamic validation
  useEffect(() => {
    setIsValid(
      firstName.trim() &&
        lastName.trim() &&
        isValidName(firstName.trim()) &&
        isValidName(lastName.trim()) &&
        isValidOptionalName(middleName.trim())
    );
  }, [firstName, middleName, lastName]);

  const handleNext = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setWarning("First name and Last name are required.");
      return;
    }

    if (!isValidName(firstName.trim())) {
      setWarning("Enter a valid first name.");
      return;
    }

    if (!isValidOptionalName(middleName.trim())) {
      setWarning(
        "Middle name can only contain letters, spaces, apostrophes, hyphens, and periods."
      );
      return;
    }

    if (!isValidName(lastName.trim())) {
      setWarning("Enter a valid last name.");
      return;
    }

    setWarning("");
    onNext({
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
    });
  };

  // Enter key support
  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (isValid) handleNext();
      }
    };

    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [isValid, firstName, middleName, lastName]);

  return (
    <>
      <FormHeaderBlock title="What’s your name?" />
      <ProgressBar currentStep={3} totalSteps={7} />

      <TextInputField
        placeholder="First name"
        value={firstName}
        onChange={(e) => {
          setFirstName(e.target.value);
          setWarning("");
        }}
        autoFocus
      />

      <TextInputField
        placeholder="Middle name (optional)"
        value={middleName}
        onChange={(e) => {
          setMiddleName(e.target.value);
          setWarning("");
        }}
      />

      <TextInputField
        placeholder="Last name"
        value={lastName}
        onChange={(e) => {
          setLastName(e.target.value);
          setWarning("");
        }}
      />

      {warning && <WarningMessage message={warning} />}

      <NextButton onClick={handleNext} disabled={!isValid}>
        Next
      </NextButton>
    </>
  );
}

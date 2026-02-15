import React, { useState, useEffect, useRef } from "react";
import { Hero, FormContainer } from "../components/shared/FormLayout";
import FormHeaderBlock from "../components/shared/FormHeaderBlock";
import { NextButton } from "../components/shared/NextButton";
import BackButton from "../components/shared/BackButton";
import WarningMessage from "../components/shared/WarningMessage";
import styled, { keyframes } from "styled-components";
import MajorSelect from "../components/shared/MajorList";
import TextInputField from "../components/shared/TextInputField";
import CountrySelect from "../components/shared/CountrySelect";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa";

export default function AddVocationalSchool({
  onNext,
  onBack,
  formData = {},
  setFormData,
  goToPreviousSignupStep,
  setStep,
}) {
  const schoolType = "vocational";
  const currentYear = new Date().getFullYear();
  const userBirthYear = formData.birthday ? new Date(formData.birthday).getFullYear() : null;

  const [schoolName, setSchoolName] = useState(formData[`${schoolType}SchoolName`] || "");
  const [yearEntered, setYearEntered] = useState(formData[`${schoolType}YearEntered`] || "");
  const [expectedGradYear, setExpectedGradYear] = useState(formData[`${schoolType}ExpectedGrad`] || "");
  const [major, setMajor] = useState(formData[`${schoolType}Major`] || "");
  const [country, setCountry] = useState(formData[`${schoolType}SchoolCountry`] || "");
  const [verificationFile, setVerificationFile] = useState(null);
  const [section, setSection] = useState(1);
  const [direction, setDirection] = useState("forward");
  const [error, setError] = useState("");
  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, [section]);

  const validateYears = (field, value) => {
    if (!/^\d{0,4}$/.test(value)) return "Invalid year format.";
    if (!value) return "";

    const yearNum = parseInt(value, 10);
    const yearEnteredNum = parseInt(yearEntered, 10);

    if (field === "yearEntered" || field === "expectedGrad") {
      if (yearNum < 1900 || yearNum > currentYear + 10) {
        return `Year must be between 1900 and ${currentYear + 10}.`;
      }
      if (userBirthYear && yearNum - userBirthYear < 8) {
        return "You must be at least 8 years old to enter vocational school.";
      }
    }

    if (field === "expectedGrad") {
      if (yearNum < yearEnteredNum) {
        return `Expected graduation year must be after your entry year.`;
      }
    }

    return "";
  };

  const handleNext = () => {
  if (!schoolName || !yearEntered || !expectedGradYear || !major || !country) {
    setError("Please fill in all fields.");
    return;
  }

  const yearError =
    validateYears("yearEntered", yearEntered) || validateYears("expectedGrad", expectedGradYear);
  if (yearError) {
    setError(yearError);
    return;
  }

  // Submit data and move forward
  onNext({
    [`${schoolType}SchoolName`]: schoolName,
    [`${schoolType}YearEntered`]: yearEntered,
    [`${schoolType}ExpectedGrad`]: expectedGradYear,
    [`${schoolType}Major`]: major,
    [`${schoolType}SchoolCountry`]: country,
    [`${schoolType}VerificationFile`]: verificationFile,
  });

  // ✅ REMOVE this → Let `Join.js` handle the step transition!
  // setStep((prev) => prev + 1);
};


  const sectionIsValid = () => {
    if (section === 1) return schoolName && country;
    if (section === 2) return yearEntered && expectedGradYear && !validateYears("yearEntered", yearEntered) && !validateYears("expectedGrad", expectedGradYear);
    if (section === 3) return major;
    if (section === 4) return verificationFile !== null;
    return false;
  };

  const totalSections = 4;

  return (
    <Hero>
      <FormContainer>
        <FormHeaderBlock
          title="Add your Vocational School"
          subTitle="Tell us about your vocational training background."
        />

        <StepTitle direction={direction}>
          {section === 1 && "School Info"}
          {section === 2 && "Academic Timeline"}
          {section === 3 && "Field of Study"}
          {section === 4 && "Proof of Enrollment"}
        </StepTitle>

        <SlideWrapper>
          {section === 1 && (
            <SectionBlock direction={direction}>
              <CountrySelect value={country} onChange={setCountry} ref={firstInputRef} />
              <TextInputField
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Enter vocational school name"
              />
            </SectionBlock>
          )}

          {section === 2 && (
            <SectionBlock direction={direction}>
              <TextInputField
                ref={firstInputRef}
                value={yearEntered}
                onChange={(e) => setYearEntered(e.target.value)}
                placeholder="Year entered"
              />
              <TextInputField
                value={expectedGradYear}
                onChange={(e) => setExpectedGradYear(e.target.value)}
                placeholder="Expected graduation year"
              />
            </SectionBlock>
          )}

          {section === 3 && (
            <SectionBlock direction={direction}>
              <MajorSelect value={major} onChange={setMajor} ref={firstInputRef} />
            </SectionBlock>
          )}

         {section === 4 && (
  <SectionBlock direction={direction}>
    <p style={{ textAlign: "center", marginBottom: "1rem", color: "gray" }}>
      Upload a document like Admission Letter, Student ID, or Tuition Receipt.
    </p>
    <div style={{ textAlign: "center" }}>
      <FileUploadLabel htmlFor="vocational-file-upload">
        {verificationFile ? "Change File" : "Upload Document"}
      </FileUploadLabel>
      <input
        type="file"
        id="vocational-file-upload"
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={(e) => setVerificationFile(e.target.files[0])}
        ref={firstInputRef}
        style={{ display: "none" }}
      />
      {verificationFile && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
          Selected: {verificationFile.name}
        </p>
      )}
    </div>
    <SkipButton
      onClick={() => {
        // Skip file upload, proceed to next step:
        onNext({
          [`${schoolType}SchoolName`]: schoolName,
          [`${schoolType}YearEntered`]: yearEntered,
          [`${schoolType}ExpectedGrad`]: expectedGradYear,
          [`${schoolType}Major`]: major,
          [`${schoolType}SchoolCountry`]: country,
          [`${schoolType}VerificationFile`]: null,  // Explicitly null
        });
        setStep((prevStep) => prevStep + 1);
      }}
    >
      Don't have any proof now? <span>Add later</span>
    </SkipButton>
  </SectionBlock>
)}

        </SlideWrapper>

        <InternalNav>
          <InternalBack onClick={() => setSection((s) => Math.max(s - 1, 1))} disabled={section === 1}>
            <FaArrowLeft /> Previous
          </InternalBack>
          <ProgressDots>
            {[...Array(totalSections)].map((_, idx) => (
              <Dot key={idx} active={section === idx + 1} />
            ))}
          </ProgressDots>
          <InternalNext onClick={() => setSection((s) => s + 1)} disabled={!sectionIsValid() || section === totalSections}>
            Next <FaArrowRight />
          </InternalNext>
        </InternalNav>

        {error && <WarningMessage message={error} />}

        <MainNav>
          <NextButton onClick={handleNext} disabled={!sectionIsValid() || section !== totalSections}>
            Submit
          </NextButton>
          <BackButton onClick={goToPreviousSignupStep}>Back</BackButton>
        </MainNav>
      </FormContainer>
    </Hero>
  );
}

// Styled Components – reuse from AddSchool or import them from shared/styles if modular
const slideInFromRight = keyframes`from { transform: translateX(100%); opacity: 0.3; } to { transform: translateX(0); opacity: 1; }`;
const slideInFromLeft = keyframes`from { transform: translateX(-100%); opacity: 0.3; } to { transform: translateX(0); opacity: 1; }`;

const SlideWrapper = styled.div`position: relative; overflow: hidden; width: 100%;`;
const SectionBlock = styled.div`animation: ${(props) => (props.direction === "forward" ? slideInFromRight : slideInFromLeft)} 0.4s ease forwards;`;
const StepTitle = styled.h3`font-size: 1.25rem; font-weight: 600; color: #000; animation: ${(props) => (props.direction === "forward" ? slideInFromRight : slideInFromLeft)} 0.4s ease forwards;`;
const InternalNav = styled.div`display: flex; justify-content: space-between; align-items: center; margin-top: 20px; margin-bottom: 20px; width: 100%;`;
const InternalBack = styled.button`background: none; border: none; color: #3b82f6; font-weight: 600; font-size: 1rem; cursor: pointer; display: flex; align-items: center; gap: 5px; opacity: ${(props) => (props.disabled ? 0.3 : 1)}; pointer-events: ${(props) => (props.disabled ? "none" : "auto")}; &:hover { color: #2563eb; }`;
const InternalNext = styled(InternalBack)``;
const ProgressDots = styled.div`display: flex; gap: 8px;`;
const Dot = styled.span`width: 12px; height: 12px; border-radius: 50%; border: 2px solid #3b82f6; background-color: ${(props) => (props.active ? "#3b82f6" : "transparent")}; transition: background-color 0.3s ease;`;
const MainNav = styled.div`display: flex; justify-content: space-between; margin-top: 30px; flex-direction: column; width: 100%;`;
const FileUploadLabel = styled.label`
  display: inline-block;
  margin: 0 auto;
  padding: 0.6rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: white;
  background-color: #3b82f6;
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  transition: background-color 0.3s ease;
  width: fit-content;

  &:hover {
    background-color: #2563eb;
  }
`;

const SkipButton = styled.button`
  background: none;
  border: none;
  color: #3b82f6;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 12px;
  text-decoration: underline;
  display: block;
  margin-left: auto;
  margin-right: auto;

  span {
    font-weight: 700;
  }

  &:hover {
    color: #2563eb;
  }
`;

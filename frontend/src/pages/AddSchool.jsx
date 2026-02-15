
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Hero, FormContainer } from "../components/shared/FormLayout";
import FormHeaderBlock from "../components/shared/FormHeaderBlock";
import { NextButton } from "../components/shared/NextButton";
import BackButton from "../components/shared/BackButton";
import WarningMessage from "../components/shared/WarningMessage";
import styled, { keyframes } from "styled-components";
import MajorSelect from "../components/shared/MajorList";
import TextInputField from "../components/shared/TextInputField";
import CountrySelect from "../components/shared/CountrySelect";
import { FaArrowLeft, FaArrowRight, FaTrashAlt } from "react-icons/fa";

// School ranking system
const schoolRank = {
  high: 1,
  vocational: 2,
  associate: 3,
  undergrad: 4,
  graduate: 5,
  doctorate: 6
};

// School display labels
const schoolLabels = {
  high: "Senior High School",
  undergrad: "Undergraduate University",
  associate: "Associate University",
  vocational: "Career/Tech Skill",
  graduate: "Graduate School",
  doctorate: "Doctorate University"
};

// School display order
const schoolOrder = ["high", "associate", "vocational", "undergrad", "graduate", "doctorate"];

// Dynamic class level options based on highest education
// Dynamic class level options based on highest education
const getClassLevelOptions = (baseType, highestEducation) => {
  const baseOptions = {
    high: ["10th Grade", "11th Grade", "12th Grade", "Completed", "Graduated"],
    associate: ["1st Year", "2nd Year", "Final Year", "Completed", "Graduated"],
    undergrad: ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year", "Completed", "Graduated"],
    graduate: ["1st Year", "2nd Year", "Final Year", "Completed", "Graduated"],
    doctorate: ["Research Phase", "Dissertation Phase", "Final Year", "Completed", "Graduated"],
    vocational: ["In Progress", "Completed", "Graduated", "Certified", "Dropped Out"]
  };

  const restricted = ["Completed", "Graduated"];

  switch (highestEducation) {
    case "doctorate":
      return {
        ...baseOptions,
        high: restricted,
        undergrad: restricted,
        graduate: restricted,
        // keep associate & vocational as-is
      };

    case "graduate":
      return {
        ...baseOptions,
        high: restricted,
        undergrad: restricted,
        // keep associate & vocational as-is
        doctorate: baseOptions.doctorate, // stays normal for editing
      };

    case "undergrad":
      return {
        ...baseOptions,
        high: restricted,
        // keep associate & vocational as-is
        graduate: baseOptions.graduate,
        doctorate: baseOptions.doctorate,
      };

    case "associate":
      return {
        ...baseOptions,
        high: restricted,
        // keep vocational as-is
        undergrad: baseOptions.undergrad,
        graduate: baseOptions.graduate,
        doctorate: baseOptions.doctorate,
      };

    default:
      return baseOptions;
  }
};


const formatLevelLabel = (type) => {
  switch (type) {
    case "undergrad": return "undergraduate";
    case "associate": return "associate";
    case "graduate": return "graduate";
    case "doctorate": return "doctoral";
    default: return "";
  }
};

export default function AddSchool({
  onNext,
  onBack,
  formData = {},
  schoolType,
  currentSchoolIndex,
  schoolTypes,
  setSchoolTypes,
  goToPreviousSignupStep,
  setStep,
  setFormData
}) {
  const currentYear = new Date().getFullYear();
  const baseType = schoolType?.split("_")?.[0] || schoolType;
  const userBirthYear = formData.birthday ? new Date(formData.birthday).getFullYear() : null;
  
  // Determine highest education level from schoolTypes
  const highestEducation = useMemo(() => {
    return schoolTypes.reduce((highest, type) => {
      const base = type.split('_')[0];
      return schoolRank[base] > schoolRank[highest] ? base : highest;
    }, "high");
  }, [schoolTypes]);

  // Get appropriate class level options
  const classLevelOptions = useMemo(() => 
    getClassLevelOptions(baseType, highestEducation), 
    [baseType, highestEducation]
  );

  // State management
  const [schoolName, setSchoolName] = useState(formData[`${schoolType}SchoolName`] || "");
  const [currentClassLevel, setCurrentClassLevel] = useState(formData[`${schoolType}CurrentLevel`] || "");
  const [yearEntered, setYearEntered] = useState(formData[`${baseType}YearEntered`] || "");
  const [expectedGradYear, setExpectedGradYear] = useState(formData[`${baseType}ExpectedGrad`] || "");
  const [gradYear, setGradYear] = useState(formData[`${baseType}GraduationYear`] || "");
  const [major, setMajor] = useState(formData[`${baseType}Major`] || "");
  const [country, setCountry] = useState(formData[`${baseType}SchoolCountry`] || "");
  const [error, setError] = useState("");
  const [section, setSection] = useState(1);
  const [direction, setDirection] = useState("forward");
  const [noProof, setNoProof] = useState(false);
  const [noMajor, setNoMajor] = useState(false);
  const [verificationFile, setVerificationFile] = useState(null);
  const firstInputRef = useRef(null);

  // Determine graduation requirements
  const forceGraduated = ["Graduated", "Completed", "Certified"].includes(currentClassLevel || "");
  const shouldAskExpectedGrad = (
    (baseType === "vocational" && currentClassLevel === "In Progress") ||
    (["high", "associate", "undergrad", "graduate", "doctorate"].includes(baseType) &&
    !["Graduated", "Completed", "Certified"].includes(currentClassLevel || ""))
  );

  // Reset state when schoolType changes
  useEffect(() => {
    const currentKey = schoolType;
    setNoMajor(formData[`${currentKey}NoMajor`] || false);
    setMajor(formData[`${currentKey}NoMajor`] ? "No Major" : formData[`${currentKey}Major`] || "");
    setSchoolName(formData[`${currentKey}SchoolName`] || "");
    setYearEntered(formData[`${currentKey}YearEntered`] || "");
    setExpectedGradYear(formData[`${currentKey}ExpectedGrad`] || "");
    setGradYear(formData[`${currentKey}GraduationYear`] || "");
    setCountry(formData[`${currentKey}SchoolCountry`] || "");
    setCurrentClassLevel(formData[`${currentKey}CurrentLevel`] || "");
    setVerificationFile(formData[`${currentKey}VerificationFile`] || null);
    setNoProof(formData[`${currentKey}NoProof`] || false);
    setError("");
    setSection(1);
    setDirection("forward");
  }, [schoolType, formData]);

  // Auto-focus first input in each section
  useEffect(() => {
    firstInputRef.current?.focus();
  }, [section]);

  // Year validation functions
  const validateYears = (field, value) => {
    if (!/^\d{0,4}$/.test(value) && value !== "Drop out") return "Invalid year format.";
    if (!value) return "";

    const yearNum = parseInt(value, 10);
    const yearEnteredNum = parseInt(yearEntered, 10);

    if (field === "yearEntered" || field === "gradYear") {
      if (yearNum < 1900 || yearNum > currentYear) {
        return `Year must be between 1900 and ${currentYear}.`;
      }
    }

    if (field === "expectedGrad" && value !== "Drop out") {
      if (yearNum < currentYear) {
        return `Expected graduation year must be this year or later.`;
      }
      if (yearEnteredNum && yearNum < yearEnteredNum) {
        return `Expected graduation year must be after your entry year.`;
      }
      if (yearNum > currentYear + 10) {
        return `Expected graduation year must be within the next 10 years.`;
      }
    }

    if (field === "gradYear" && yearEntered) {
      if (yearNum < yearEnteredNum || yearNum > currentYear) {
        return `Graduation year must be between ${yearEnteredNum} and ${currentYear}.`;
      }
    }

    return "";
  };

  // Validate education progression
  const validateEducationProgression = () => {
    if (highestEducation === "doctorate") {
      const mustBeCompleted = ["high", "undergrad", "graduate"];
      
      if (mustBeCompleted.includes(baseType) && 
          !["Completed", "Graduated"].includes(currentClassLevel)) {
        return `You must have completed ${schoolLabels[baseType]} to be in a Doctorate program`;
      }
    }
    return "";
  };

  // Input handlers
  const handleYearEnteredChange = (value) => {
    if (/^\d{0,4}$/.test(value)) {
      setYearEntered(value);
      setError(validateYears("yearEntered", value));
    }
  };

  const handleExpectedGradChange = (value) => {
    setExpectedGradYear(value);
    setError(validateYears("expectedGrad", value));
  };

  const handleGradYearChange = (value) => {
    if (/^\d{0,4}$/.test(value)) {
      setGradYear(value);
      setError(validateYears("gradYear", value));
    }
  };

  // Section navigation
  const totalSections = 4;

  const handleSectionNext = () => {
    if (section < totalSections) {
      setDirection("forward");
      setSection(section + 1);
    }
  };

  const handleSectionBack = () => {
    if (section > 1) {
      setDirection("backward");
      setSection(section - 1);
    } else {
      onBack();
    }
  };

  // Form submission
  const handleNext = () => {
    // Validate all fields
    if (!userBirthYear) {
      setError("Please provide your birthdate before entering school details.");
      return;
    }

    const progressionError = validateEducationProgression();
    if (progressionError) {
      setError(progressionError);
      return;
    }

    if (!schoolName || !yearEntered) {
      setError("Please enter your school name and year entered.");
      return;
    }

    if (shouldAskExpectedGrad && !expectedGradYear) {
      setError("Please enter your expected graduation year.");
      return;
    }

    if (forceGraduated && !gradYear) {
      setError("Please enter your graduation year.");
      return;
    }

    if (!major) {
      setError("Please select your field of study.");
      return;
    }

    if (!country) {
      setError("Please select your school country.");
      return;
    }

    const yearError =
      validateYears("yearEntered", yearEntered) ||
      (shouldAskExpectedGrad && validateYears("expectedGrad", expectedGradYear)) ||
      (forceGraduated && validateYears("gradYear", gradYear));
    
    if (yearError) {
      setError(yearError);
      return;
    }

    if (classLevelOptions[baseType] && !currentClassLevel) {
      setError("Please select your current class or level.");
      return;
    }

    // Submit data
    setError("");
    onNext({
      [`${schoolType}SchoolName`]: schoolName,
      [`${schoolType}YearEntered`]: yearEntered,
      [`${schoolType}GraduationYear`]: forceGraduated ? gradYear : "",
      [`${schoolType}Major`]: noMajor ? "No Major" : major,
      [`${schoolType}SchoolCountry`]: country,
      [`${schoolType}ExpectedGrad`]: shouldAskExpectedGrad ? expectedGradYear : "",
      [`${schoolType}NoMajor`]: noMajor,
      [`${schoolType}CurrentLevel`]: currentClassLevel,
      [`${schoolType}VerificationFile`]: verificationFile,
      [`${schoolType}NoProof`]: noProof,
      isNew: !formData[`${schoolType}SchoolName`]
    });

    // Navigate to next step
    if (section === totalSections) {
      const currentIndex = schoolTypes.findIndex((type) => type === schoolType);
      if (currentIndex < schoolTypes.length - 1) {
        setStep(12 + currentIndex + 1);
      } else {
        setStep(12 + schoolTypes.length);
      }
    } else {
      setDirection("forward");
      setSection(section + 1);
    }
  };

  // Check if current section is valid
  const sectionIsValid = () => {
    switch (section) {
      case 1:
        return country && schoolName && (!classLevelOptions[baseType] || currentClassLevel);
      case 2:
        if (!yearEntered || validateYears("yearEntered", yearEntered)) return false;
        if (shouldAskExpectedGrad && (!expectedGradYear || validateYears("expectedGrad", expectedGradYear))) return false;
        if (forceGraduated && (!gradYear || validateYears("gradYear", gradYear))) return false;
        return true;
      case 3:
        return major || noMajor;
      case 4:
        return verificationFile || noProof;
      default:
        return false;
    }
  };

  return (
    <Hero>
      <FormContainer>
        <FormHeaderBlock
          title={formData[`${schoolType}SchoolName`] 
            ? `Edit Your ${schoolLabels[baseType]}` 
            : `Add Your ${schoolLabels[baseType]}`}
          subTitle={formData[`${schoolType}SchoolName`] 
            ? "Update your school information below" 
            : "Fill in your school details to help us match you with opportunities."}
        />

        <StepTitle direction={direction}>
          {section === 1 && "School Info"}
          {section === 2 && "Academic Timeline"}
          {section === 3 && "Field of Study"}
          {section === 4 && (forceGraduated ? "Prove Your Graduation" : "Prove Your Enrollment")}
        </StepTitle>

        <SlideWrapper>
          {section === 1 && (
            <SectionBlock direction={direction}>
              <CountrySelect value={country} onChange={setCountry} ref={firstInputRef} />
              <TextInputField
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder={`Enter your ${schoolLabels[baseType] || "school"} name`}
              />

              {classLevelOptions[baseType] && (
                <div style={{ width: "100%", marginBottom: "1rem" }}>
                  <Select
                    value={currentClassLevel}
                    onChange={(e) => setCurrentClassLevel(e.target.value)}
                    required
                  >
                    <option value="">
                      {baseType === "vocational" 
                        ? "Select your training status" 
                        : `Select your current ${formatLevelLabel(baseType)} level`}
                    </option>
                    {classLevelOptions[baseType].map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </Select>
                </div>
              )}

              {(baseType === "associate" || baseType === "vocational") && (
                <SkipButton
                  onClick={() => {
                    const currentIndex = schoolTypes.findIndex((type) => type === baseType);
                    const nextStep = 12 + currentIndex + 1;
                    setStep(nextStep);
                  }}
                >
                  Never enrolled for {schoolLabels[baseType]}? <span> Skip</span>
                </SkipButton>
              )}
            </SectionBlock>
          )}

          {section === 2 && (
            <SectionBlock direction={direction}>
              <TextInputField
                ref={firstInputRef}
                value={yearEntered}
                onChange={(e) => handleYearEnteredChange(e.target.value)}
                placeholder="Year you entered this school"
              />

              {shouldAskExpectedGrad && (
                <div style={{ width: "100%", marginBottom: "1rem" }}>
                  <Select
                    value={expectedGradYear}
                    onChange={(e) => handleExpectedGradChange(e.target.value)}
                  >
                    <option value="">Year you expect to graduate</option>
                    <option value="Drop out">Drop out</option>
                    {Array.from({ length: 10 }, (_, i) => {
                      const year = (parseInt(yearEntered) || currentYear) + i;
                      return year <= currentYear + 10 && (
                        <option key={year} value={year}>{year}</option>
                      );
                    })}
                  </Select>
                </div>
              )}

              {forceGraduated && (
                <TextInputField
                  value={gradYear}
                  onChange={(e) => handleGradYearChange(e.target.value)}
                  placeholder="Graduation year"
                />
              )}
            </SectionBlock>
          )}

          {section === 3 && (
            <SectionBlock direction={direction}>
              <MajorSelect 
                value={major} 
                onChange={(val) => !noMajor && setMajor(val)}
                disabled={noMajor} 
                schoolType={baseType}
                required={baseType === "vocational"}
                ref={firstInputRef}
              />

              {baseType === "high" && (
                <CheckboxWrapper>
                  <input
                    type="checkbox"
                    checked={noMajor}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setNoMajor(isChecked);
                      setMajor(isChecked ? "No Major" : "");
                    }}
                    id="noMajorCheckbox"
                  />
                  <label htmlFor="noMajorCheckbox">
                    My school doesn't offer a field of study
                  </label>
                </CheckboxWrapper>
              )}
            </SectionBlock>
          )}

          {section === 4 && (
            <SectionBlock direction={direction}>
              <p style={{ textAlign: "center", marginBottom: "1rem", color: "gray", marginTop: "10px" }}>
                {forceGraduated
                  ? <>Please upload any of the following documents to prove you graduated from this school: <b>Certificate, Diploma, Degree, Transcript, Letter of Recommendation, or Attestation.</b></>
                  : <>Please upload any of the following documents to prove you're currently enrolled in this school: <b>Valid Admission Letter, Student ID or Tuition payment receipt</b></>
                }
              </p>

              <div style={{ textAlign: "center", marginBottom: "1rem", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                <FileUploadLabel htmlFor="file-upload" disabled={noProof}>
                  {verificationFile ? "Change File" : "Upload Document"}
                </FileUploadLabel>
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={noProof}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setVerificationFile(file);
                      setNoProof(false);
                    }
                  }}
                  style={{ display: "none" }}
                />

                {verificationFile && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem"}}>
                    <span>Selected: {verificationFile.name}</span>
                    <span
                      onClick={() => setVerificationFile(null)}
                      style={{
                        backgroundColor: "#007bff",
                        borderRadius: "50%",
                        width: "28px",
                        height: "28px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                      title="Remove file"
                    >
                      <FaTrashAlt color="white" size={14} />
                    </span>
                  </div>
                )}
              </div>

              <CheckboxWrapper>
                <input
                  type="checkbox"
                  checked={noProof}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setNoProof(checked);
                    if (checked) setVerificationFile(null);
                  }}
                  id="no-proof-checkbox"
                />
                <label htmlFor="no-proof-checkbox">
                  I don't have proof now
                </label>
              </CheckboxWrapper>
            </SectionBlock>
          )}
        </SlideWrapper>

        <InternalNav>
          <InternalBack onClick={handleSectionBack} disabled={section === 1 && currentSchoolIndex === 0}>
            <FaArrowLeft /> Previous
          </InternalBack>
          <ProgressDots>
            {[...Array(totalSections)].map((_, idx) => (
              <Dot key={idx + 1} active={section === idx + 1} />
            ))}
          </ProgressDots>
          <InternalNext
            onClick={handleSectionNext}
            disabled={!sectionIsValid() || section === totalSections}
          >
            Next <FaArrowRight />
          </InternalNext>
        </InternalNav>

        {error && <WarningMessage message={error} />}

        <MainNav>
          <NextButton
            onClick={handleNext}
            disabled={!sectionIsValid() || section !== totalSections}
          >
            {formData[`${schoolType}SchoolName`] ? "Update" : "Submit"}
          </NextButton>
          <BackButton
            onClick={() => {
              if (currentSchoolIndex > 0) {
                setStep(12 + currentSchoolIndex - 1);
              } else {
                goToPreviousSignupStep();
              }
            }}
          >
            {currentSchoolIndex > 0 ? "Edit Previous School" : "Back"}
          </BackButton>
        </MainNav>
      </FormContainer>
    </Hero>
  );
}

// Styled components (unchanged)
const slideInFromRight = keyframes`
  from { transform: translateX(100%); opacity: 0.3; }
  to { transform: translateX(0); opacity: 1; }
`;

const slideInFromLeft = keyframes`
  from { transform: translateX(-100%); opacity: 0.3; }
  to { transform: translateX(0); opacity: 1; }
`;

const SlideWrapper = styled.div`
  position: relative;
  overflow: hidden;
  width: 100%;
`;

const SectionBlock = styled.div`
  animation: ${(props) =>
      props.direction === "forward" ? slideInFromRight : slideInFromLeft}
    0.4s ease forwards;
`;

const StepTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #000;
  animation: ${(props) =>
      props.direction === "forward" ? slideInFromRight : slideInFromLeft}
    0.4s ease forwards;
`;

const InternalNav = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  
  width: 100%;
`;

const InternalBack = styled.button`
  background: none;
  border: none;
  color: #3b82f6;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: ${(props) => (props.disabled ? 0.3 : 1)};
  pointer-events: ${(props) => (props.disabled ? "none" : "auto")};
  &:hover {
    color: #2563eb;
  }
`;

const InternalNext = styled(InternalBack)``;

const ProgressDots = styled.div`
  display: flex;
  gap: 8px;
`;

const Dot = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #3b82f6;
  background-color: ${(props) => (props.active ? "#3b82f6" : "transparent")};
  transition: background-color 0.3s ease;
`;

const MainNav = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 30px;
  flex-direction: column;
  width: 100%;
`;

const AssociateConsent = styled.p`
  margin-top: 1rem;
  text-align: center;

  button {
    color: red;
    background: none;
    border: none;
    cursor: pointer;
    font-weight: 600;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const SkipButton = styled(BackButton)`
margin-top:1px;
color:black;
font-size: 0.9rem;
font-weight: 500;
&:hover {
  font-weight: 500;
  color:black;
  font-size: 0.9rem;
 
}
span{
color: #3b82f6;
font-weight: 600;
}
`

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #000;
  font-size: 0.9rem;
  max-width: 350px;
  font-weight: 600;
  margin: 1rem auto;
  justify-content: center;

  input {
    width: 18px;
    height: 18px;
    cursor: pointer;
    text-align: center;
  }

  label {
    cursor: pointer;
  }
`;
const FileUploadLabel = styled.label`
  display: inline-block;
  margin: 0 auto;
  padding: 0.6rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: white;
  background-color: ${({ disabled }) => (disabled ? "#94a3b8" : "#3b82f6")}; /* Gray if disabled */
  border-radius: 6px;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  text-align: center;
  transition: background-color 0.3s ease;
  width: fit-content;

  &:hover {
    background-color: ${({ disabled }) =>
      disabled ? "#94a3b8" : "#2563eb"}; /* Maintain disabled color on hover */
  }
`;



const Select = styled.select`
  width: 100%;
  padding: 0.75rem 2.5rem 0.75rem 1rem; /* extra right padding for arrow */
  border-radius: 30px;
  border: 1.5px solid #ccc;
  font-size: 1rem;
  margin-top: 1rem;
 
  color: gray;
  font-weight: 600;
  font-family: "Inter", sans-serif;

  /* Remove default arrow */
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;

  /* Custom arrow using CSS */
  background-image: url("data:image/svg+xml;utf8,<svg fill='%23374151' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  background-size: 1rem;
  background-color: rgba(217, 217, 217, 0.3);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.08);

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: #eff6ff;
    color:black;
  }
`;

const AddAnotherButton = styled.button`

  border: 2.5px solid;

  padding: 0.9rem 1.2rem;
  font-weight: 600;
  font-size: 1rem;
  border-radius: 25px;
 cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  width: 100%;
  transition: background-color 0.3s ease, color 0.3s ease;
  background-color: ${({ disabled }) => (disabled ? "#94a3b8" : "#f0f0f0")}; /* Gray if disabled */
  color: ${({ disabled }) => (disabled ? "#f0f0f0" : "#3b82f6")}; /* Gray if disabled */
  border-color: ${({ disabled }) => (disabled ? "#f0f0f0" : "#000")}; /* Gray if disabled */

  &:hover {
    &:hover {
    background-color: ${({ disabled }) =>
      disabled ? "#94a3b8" : "#2563eb"}; /* Maintain disabled color on hover */
    color:white;
    border-color: ${({ disabled }) => (disabled ? "#f0f0f0" : "#2563eb")}; /* Gray if disabled */
  }
  }
`;
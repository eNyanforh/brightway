import React, { useState } from "react";
import { Hero, FormContainer } from "./shared/FormLayout";
import EducationLevelSelector from "./shared/EducationLevelSelector";
import FormHeaderBlock from "./shared/FormHeaderBlock";
import SchoolFormList from "./SchoolFormList";

const formalLevels = {
  "Senior High School": ["Grade 10", "Grade 11", "Grade 12", "Completed", "Graduated"],
  "Associate Degree": ["1st Year", "2nd Year", "Completed", "Graduated"],
  "Bachelor's Degree": ["1st Year", "2nd Year", "3rd Year", "4th Year", "Completed", "Graduated"],
  "Master's Degree": ["1st Year", "2nd Year", "Graduated"],
  "Doctorate Degree": ["Research Phase", "Writing Thesis", "Completed", "Graduated"]
};

const vocationalLevels = {
  "Vocational / Professional Certificate": ["1st Year", "2nd Year", "Completed", "Graduated"],
  "Technical / Professional Diploma": ["1st Year", "2nd Year", "3rd Year", "Completed", "Graduated"],
  "Apprenticeship": ["Beginner", "Intermediate", "Completed"],
  "Short-Term Training": ["Completed"]
};

export default function SignupStepEducationWithSchools({ onNext, onBack, formData }) {
  const [formalEducation, setFormalEducation] = useState(formData.formalEducation || "");
  const [vocationalEducation, setVocationalEducation] = useState(formData.vocationalEducation || "");
  const [schoolsData, setSchoolsData] = useState(formData.schoolsData || {});

  const handleSchoolsChange = (level, updatedEntries) => {
    setSchoolsData((prev) => ({ ...prev, [level]: updatedEntries }));
  };

  const getSequence = () => {
    switch (formalEducation) {
      case "Senior High School":
        return ["High School", ...(vocationalEducation ? ["Vocational"] : [])];
      case "Associate Degree":
        return ["High School", "Associate", ...(vocationalEducation ? ["Vocational"] : [])];
      case "Bachelor's Degree":
        return ["High School", { level: "Associate", optional: true }, "Undergraduate", ...(vocationalEducation ? ["Vocational"] : [])];
      case "Master's Degree":
        return ["High School", { level: "Associate", optional: true }, "Undergraduate", "Master"];
      case "Doctorate Degree":
        return ["High School", { level: "Associate", optional: true }, "Undergraduate", "Master", "Doctorate", ...(vocationalEducation ? ["Vocational"] : [])];
      default:
        return [];
    }
  };

  const handleSubmit = () => {
    onNext({
      ...formData,
      formalEducation,
      vocationalEducation,
      schoolsData
    });
  };

  const sequence = getSequence();

  return (
    <Hero>
      <FormContainer>
        <FormHeaderBlock title="Select your education levels and add schools" />

        {/* Formal Education Selector */}
        <EducationLevelSelector
          levelsData={formalLevels}
          defaultMain={formalEducation}
          defaultSub={formData.subLevel}
          onNext={({ formalEducation }) => setFormalEducation(formalEducation)}
          formKeyMain="formalEducation"
          formKeySub="subLevel"
        />

        {/* Vocational Education Selector */}
        <EducationLevelSelector
          levelsData={vocationalLevels}
          defaultMain={vocationalEducation}
          defaultSub={formData.vocationalStatus}
          onNext={({ vocationalEducation }) => setVocationalEducation(vocationalEducation)}
          formKeyMain="vocationalEducation"
          formKeySub="vocationalStatus"
        />

        {/* Dynamic Multiple School Forms */}
        {sequence.map((item, idx) => {
          const level = typeof item === "string" ? item : item.level;
          const optional = typeof item === "object" && item.optional;
          return (
            <SchoolFormList
              key={idx}
              level={level}
              optional={optional}
              entries={schoolsData[level] || [{}]}
              onChange={(updated) => handleSchoolsChange(level, updated)}
            />
          );
        })}

        <div className="form-actions">
          <button type="button" onClick={onBack}>Back</button>
          <button type="button" onClick={handleSubmit}>Next</button>
        </div>
      </FormContainer>
    </Hero>
  );
}

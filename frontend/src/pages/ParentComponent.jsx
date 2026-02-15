import React, { useState, useCallback, useEffect } from "react";
import AddSchool from "./AddSchool";

const schoolOrder = ["high", "associate", "undergrad", "graduate", "doctorate"];

export default function ParentComponent() {
  const [formData, setFormData] = useState({});
  const [currentSchoolIndex, setCurrentSchoolIndex] = useState(0);
  const [schoolTypes, setSchoolTypes] = useState(schoolOrder);

  const buildSchoolTypes = useCallback((formalEducation, hasAssociate) => {
    console.log(`Building school types: formalEducation=${formalEducation}, hasAssociate=${hasAssociate}`);
    let types = ["high"];
    if (formalEducation === "Senior High School") return types;
    if (hasAssociate) types.push("associate");
    if (["Bachelor's Degree", "Master's Degree", "Doctorate Degree"].includes(formalEducation)) {
      types.push("undergrad");
    }
    if (["Master's Degree", "Doctorate Degree"].includes(formalEducation)) {
      types.push("graduate");
    }
    if (formalEducation === "Doctorate Degree") {
      types.push("doctorate");
    }
    console.log("New schoolTypes:", types);
    return types;
  }, []);

  const handleNext = useCallback((newSchoolData) => {
    console.log("handleNext: Saving data for schoolType:", newSchoolData);
    setFormData((prev) => {
      const updated = { ...prev, ...newSchoolData };
      console.log("Updated formData:", updated);
      return updated;
    });
    if (currentSchoolIndex < schoolTypes.length - 1) {
      setCurrentSchoolIndex(currentSchoolIndex + 1);
      console.log("Navigating to next school, new index:", currentSchoolIndex + 1);
    } else {
      console.log("Form complete:", { ...formData, ...newSchoolData });
    }
  }, [currentSchoolIndex, schoolTypes.length, formData]);

  const handleBack = useCallback(() => {
    if (currentSchoolIndex > 0) {
      setCurrentSchoolIndex(currentSchoolIndex - 1);
      console.log("Navigating to previous school, new index:", currentSchoolIndex - 1);
    } else {
      console.log("No previous school, navigating to previous signup step");
      goToPreviousSignupStep();
    }
  }, [currentSchoolIndex]);

  const goToPreviousSignupStep = useCallback(() => {
    console.log("Navigating to previous signup step");
  }, []);

  const setStep = useCallback((step) => {
    const newSchoolTypes = buildSchoolTypes(formData.formalEducation, formData.hasAssociateDegree === "Yes");
    setSchoolTypes(newSchoolTypes);
    const newIndex = newSchoolTypes[step - 12] ? newSchoolTypes.findIndex((s) => s === newSchoolTypes[step - 12]) : 0;
    console.log(`setStep: Navigating to step ${step}, newIndex: ${newIndex}, newSchoolTypes: ${newSchoolTypes}`);
    setCurrentSchoolIndex(newIndex);
  }, [formData.formalEducation, formData.hasAssociateDegree, buildSchoolTypes]);

  // Debug formData and navigation changes
  useEffect(() => {
    console.log("Parent state - formData:", formData, "currentSchoolIndex:", currentSchoolIndex, "schoolType:", schoolTypes[currentSchoolIndex]);
  }, [formData, currentSchoolIndex, schoolTypes]);

  return (
    <AddSchool
      onNext={handleNext}
      onBack={handleBack}
      formData={formData}
      schoolType={schoolTypes[currentSchoolIndex]}
      currentSchoolIndex={currentSchoolIndex}
      schoolTypes={schoolTypes}
      goToPreviousSignupStep={goToPreviousSignupStep}
      setStep={setStep}
      setFormData={setFormData}
      buildSchoolTypes={buildSchoolTypes}
    />
  );
}
import React, { useState } from "react";
import AddSchool from "./AddSchool";

export default function SchoolOnboardingFlow({ onComplete }) {
  // form data state accumulates data from all school steps
  const [formData, setFormData] = useState({});

  // Initial steps order
  const initialSteps = ["high", "undergrad", "graduate", "doctorate"];

  const [steps, setSteps] = useState(initialSteps);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Show associate degree confirmation only after Bachelor step
  const [showAssociateQuestion, setShowAssociateQuestion] = useState(false);

  const currentStep = steps[currentStepIndex];

  // When user clicks Next on AddSchool step
  const handleNext = (data) => {
    setFormData((prev) => ({ ...prev, ...data }));

    if (currentStep === "undergrad" && !showAssociateQuestion) {
      // Show confirmation question after Bachelor step is done
      setShowAssociateQuestion(true);
    } else if (currentStepIndex === steps.length - 1) {
      // Last step completed
      onComplete(formData);
    } else {
      // Move to next step
      setCurrentStepIndex((i) => i + 1);
    }
  };

  // Handle Back button
  const handleBack = () => {
    if (showAssociateQuestion) {
      // Hide confirmation question and stay on Bachelor step
      setShowAssociateQuestion(false);
    } else if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    }
  };

  // Handle answer for associate degree question
  const onAssociateAnswer = (answer) => {
    if (answer === "yes") {
      // Insert 'associate' step before 'undergrad' if not already in steps
      setSteps((prev) => {
        if (!prev.includes("associate")) {
          const index = prev.indexOf("undergrad");
          const newSteps = [...prev];
          newSteps.splice(index, 0, "associate");
          return newSteps;
        }
        return prev;
      });

      setShowAssociateQuestion(false);

      // Move to the new associate step, which is before undergrad
      setCurrentStepIndex((i) => i); // keep index at current, now pointing to associate
    } else {
      // User has no associate degree, skip it
      setShowAssociateQuestion(false);
      setCurrentStepIndex((i) => i + 1); // skip associate, move after bachelor
    }
  };

  return (
    <div>
      {showAssociateQuestion ? (
        <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
          <h2>Do you also have an Associate Degree?</h2>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 20 }}>
            <button onClick={() => onAssociateAnswer("yes")} style={{ padding: "10px 20px" }}>
              Yes
            </button>
            <button onClick={() => onAssociateAnswer("no")} style={{ padding: "10px 20px" }}>
              No
            </button>
          </div>
          <button
            onClick={handleBack}
            style={{ marginTop: 30, color: "#555", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
          >
            Back
          </button>
        </div>
      ) : (
        <AddSchool
          schoolType={currentStep}
          onNext={handleNext}
          onBack={handleBack}
          formData={formData}
        />
      )}
    </div>
  );
}

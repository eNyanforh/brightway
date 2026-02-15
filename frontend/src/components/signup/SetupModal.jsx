import React, { useState } from "react";

// Steps
import Step9ProfilePic from "./steps/Step9ProfilePic";
import Signup24UserRole from "./steps/Signup24Purose";
import Step10Interest from "./steps/Step10Interest";
import Step20Bio from "./steps/Step20Bio";

// Shared layout
import { Backdrop, Modal, FormContainer } from "../shared/FormLayout";

export default function SetupModal({ onComplete }) {
  const [formData, setFormData] = useState({});
  const [stepIndex, setStepIndex] = useState(0); // use array index for easier navigation

  /* ---------- Step Array ---------- */
  const allSteps = [
    {
      component: <Step9ProfilePic />,
      skip: () => false, // never skip
    },
    {
      component: <Signup24UserRole />,
      skip: () => false,
    },
    {
      component: <Step10Interest />,
      skip: () => false,
    },
    {
      component: <Step20Bio />,
      skip: () => false,
    },
    // Add more steps here in the future
  ];

  /* ---------- Filter steps dynamically ---------- */
  const steps = allSteps.filter((stepObj) => !stepObj.skip(formData));
  const currentStepObj = steps[stepIndex];
  const totalSteps = steps.length;

  /* ---------- Navigation Handlers ---------- */
  const nextStep = (data = {}) => {
    const updatedData = { ...formData, ...data };
    setFormData(updatedData);

    if (stepIndex === steps.length - 1) {
      // Last step → submit
      onComplete(updatedData);
    } else {
      setStepIndex(stepIndex + 1);
    }
  };

  const prevStep = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  /* ---------- Clone step component with props ---------- */
  const stepWithProps = React.cloneElement(currentStepObj.component, {
    onNext: nextStep,
    onBack: prevStep,
    formData,
  });

  return (
    <Backdrop>
      <FormContainer>
        <Modal onClick={(e) => e.stopPropagation()}>
          {stepWithProps}
        </Modal>
      </FormContainer>
    </Backdrop>
  );
}

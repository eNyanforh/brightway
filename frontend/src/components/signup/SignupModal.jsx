import React, { useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Steps
import Step1Contact from "./steps/Step1Contact";
import Step2VerifyContact from "./steps/Step2VerifyContact";
import Step3Names from "./steps/Step3Names";
import Step4Birthdate from "./steps/Step4Birthdate";
import Step5Gender from "./steps/Step5Gender";
import Step6Password from "./steps/Step6Password";
import Step7Agreement from "./steps/Step7Agreement";
import Step9ProfilePic from "./steps/Step9ProfilePic";
import Signup24UserRole from "./steps/Signup24Purose";
import Step10Interest from "./steps/Step10Interest";
import Step20Bio from "./steps/Step20Bio";

// Layout
import { Backdrop, Modal, CloseButton, FormContainer } from "../shared/FormLayout";
import { useUser } from "./UserContext";

export default function SignupModal({ onClose }) {
  const { setSignupUser } = useUser();
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState({});

  /* ---------- Step Registry ---------- */
  const steps = [
    Step1Contact,
    Step2VerifyContact,
    Step3Names,
    Step4Birthdate,
    Step5Gender,
    Step6Password,
    Step7Agreement,
    Step9ProfilePic,
    Signup24UserRole,
    Step10Interest,
    Step20Bio, // ✅ final step
  ];

  const StepComponent = steps[stepIndex];

  /* ---------- Navigation ---------- */
  const nextStep = (data = {}) => {
    const updatedData = { ...formData, ...data };
    setFormData(updatedData);

    const isLastStep = stepIndex === steps.length - 1;

    if (isLastStep) {
      // ✅ Final submission
      setSignupUser(updatedData);
      onClose?.();
      navigate("/feed");
    } else {
      setStepIndex((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (stepIndex > 0) setStepIndex((prev) => prev - 1);
  };

  return (
    <Backdrop>
      <FormContainer>
        <Modal onClick={(e) => e.stopPropagation()}>
          <CloseButton onClick={onClose}>
            <X size={25} />
          </CloseButton>

          <StepComponent formData={formData} onNext={nextStep} onBack={prevStep} />
        </Modal>
      </FormContainer>
    </Backdrop>
  );
}

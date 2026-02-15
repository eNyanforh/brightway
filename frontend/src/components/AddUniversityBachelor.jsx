import React from "react";
import {Hero, FormContainer} from "./shared/FormLayout";
import FormHeaderBlock from "./shared/FormHeaderBlock";
import { NextButton } from "./shared/NextButton";
import BackButton from "./shared/BackButton";

export default function AddUniversityAssociate({ onNext, onBack, formData }) {
  const handleSubmit = () => {
    // You can validate and collect data here
    onNext({ universityName: "Example University", degree: "Bachelor" });
  };

  return (
    <Hero>
      <FormContainer>
        <FormHeaderBlock title="Add Your Bachelor University Info" />
        {/* Replace below with real form inputs */}
        <NextButton onClick={handleSubmit}>Next</NextButton>
        <BackButton onClick={onBack}>Back</BackButton>
      </FormContainer>
    </Hero>
  );
}

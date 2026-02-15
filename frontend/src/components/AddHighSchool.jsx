import React, { useState } from "react";
import { Hero, FormContainer } from "./shared/FormLayout";
import FormHeaderBlock from "./shared/FormHeaderBlock";
import { NextButton } from "./shared/NextButton";
import BackButton from "./shared/BackButton";

export default function AddHighSchool({ onNext, onBack, formData }) {
  const [school, setSchool] = useState("");

  return (
    <Hero>
      <FormContainer>
        <FormHeaderBlock
          title="Add Your High School"
          subTitle="Include the school name, year entered, and expected graduation year."
        />

        <input
          type="text"
          placeholder="Enter high school name"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
        />

        <NextButton onClick={() => onNext({ ...formData, highSchool: school })}>
          Next
        </NextButton>
        <BackButton onClick={onBack}>Back</BackButton>
      </FormContainer>
    </Hero>
  );
}

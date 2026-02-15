// SignupStep18.js

import React from "react";
import { Hero, FormContainer } from "../shared/FormLayout";
import EducationLevelSelector from "../shared/EducationLevelSelector";
import FormHeaderBlock from "../shared/FormHeaderBlock";

const vocationalLevels = {
  "Vocational / Professional Certificate": ["1st Year", "2nd Year", "Completed", "Graduated"],
  "Technical / Professional Diploma": ["1st Year", "2nd Year", "3rd Year", "Completed", "Graduated"],
  "Apprenticeship": ["Beginner", "Intermediate", "Completed"],
  "Short-Term Training": ["Completed"]
};

export default function SignupStep18({ onNext, onBack, formData }) {
  return (
    <Hero>
      <FormContainer>
        <FormHeaderBlock title={"What's your current level of vocational or technical education?"} />
        <EducationLevelSelector
          levelsData={vocationalLevels}
          defaultMain={formData.vocationalEducation}
          defaultSub={formData.vocationalStatus}
          onNext={(data) =>
            onNext({ ...formData, ...data }, 'goToAddVocationalSchool')
          }
          onBack={onBack}
          formKeyMain="vocationalEducation"
          formKeySub="vocationalStatus"
        />
      </FormContainer>
    </Hero>
  );
}

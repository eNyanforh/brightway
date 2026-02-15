// utils/getEducationFlow.js
export function getEducationFlow(formalEducation) {
  switch (formalEducation) {
    case "Senior High School":
      return ["AddHighSchool"];
    case "Associate Degree":
      return ["AddUniversity_Associate", "AddHighSchool"];
    case "Bachelor's Degree":
      return ["AddUniversity_Bachelor", "AddHighSchool"];
    case "Master's Degree":
      return [
        "AddUniversity_Master",
        "AddUniversity_Bachelor",
        "AddHighSchool"
      ];
    case "Doctorate Degree":
      return [
        "AddUniversity_Doctorate",
        "AddUniversity_Master",
        "AddUniversity_Bachelor",
        "AddHighSchool"
      ];
    default:
      return [];
  }
}

export const blankJobSpecification = () => ({
  category: "", experienceLevel: "", vacancies: null, country: "", region: "", city: "", address: "", benefits: [],
  minimumEducation: "", studyFields: [], experienceMonths: null, requiredSkills: [], preferredSkills: [],
  certifications: [], languages: [], responsibilities: [], requiredQualifications: [], preferredQualifications: [],
  expectedStartDate: "", documentQuestionIds: {}, additionalDocuments: [], applicationLimit: null,
  recruitmentStages: [], expectedHiringDate: "", reviewerIds: [],
});
export const blankScholarshipSpecification = () => ({
  category: "", academicLevels: [], studyFields: [], awards: null,
  fundingType: "", scholarshipValue: null, currency: null, fundingDurationMonths: null,
  tuitionCoverage: "NONE", customTuitionPercent: null, livingAllowance: null, accommodation: false,
  travelSupport: false, healthInsurance: false, booksMaterials: false, otherBenefits: [],
  studyCountry: "", studyRegion: "", hostInstitution: "", hostInstitutionId: null, programs: [], programDurationMonths: null,
  academicIntake: "", eligibleCountries: [], minimumEducation: "", academicRequirement: "", eligibleStudyFields: [],
  ageMin: null, ageMax: null, workExperienceMonths: null, languages: [], financialNeed: false,
  eligibilityCriteria: [], applicationsOpen: "", documentQuestionIds: {}, additionalDocuments: [],
  selectionCriteria: "", selectionStages: [], announcementDate: "",
});
const goodDate = value => value && Number.isFinite(new Date(value).getTime()) && new Date(value).getTime() > Date.now();
export function validateDedicatedStep(draft, step) {
  const job = draft.type === "JOB";
  const sch = draft.type === "SCHOLARSHIP";
  if (!job && !sch) return null;
  const spec = job ? { ...blankJobSpecification(), ...draft.jobSpecification } :
    { ...blankScholarshipSpecification(), ...draft.scholarshipSpecification };
  if (step === 6) {
    for (let i = 1; i <= 5; i++) {
      const error = validateDedicatedStep(draft, i);
      if (error) return error;
    }
    return null;
  }
  if (step === 1 && (draft.title.trim().length < 3 || draft.description.trim().length < 30 || !spec.category.trim()))
    return "Add a title, description (at least 30 characters), and category.";
  if (job) {
    if (step === 1 && (!draft.jobDetails?.type || !spec.experienceLevel)) return "Choose a job type and experience level.";
    if (step === 2) {
      if (draft.location.trim().length < 2 || !draft.jobDetails?.compensationType) return "Provide a location and compensation type.";
      const j = draft.jobDetails;
      const amounts = j.salaryMin !== null && j.salaryMin !== undefined || j.salaryMax !== null && j.salaryMax !== undefined;
      if (amounts && (j.salaryMin === null || j.salaryMin === undefined || j.salaryMax === null || j.salaryMax === undefined ||
        j.salaryMin > j.salaryMax || !j.salaryCurrency || !j.salaryPeriod)) return "Complete the salary range, currency, and period.";
    }
    if (step === 3 && (!spec.responsibilities.length || !spec.requiredQualifications.length))
      return "Add at least one responsibility and one required qualification.";
    if (step === 4 && !goodDate(draft.deadline)) return "Choose a future application deadline.";
  } else {
    if (step === 1 && !spec.academicLevels.length) return "Select at least one academic level.";
    if (step === 2 && (!spec.fundingType || (spec.fundingType === "FIXED" && (spec.scholarshipValue === null || !spec.currency)) ||
       (spec.scholarshipValue !== null && !spec.currency) ||
       (spec.tuitionCoverage === "CUSTOM" && spec.customTuitionPercent === null)))
      return "Complete the funding details and any required amounts.";
    if (step === 3 && draft.location.trim().length < 2) return "Enter the study location shown to applicants.";
    if (step === 4 && (!spec.eligibleCountries.length || (spec.ageMin !== null && spec.ageMax !== null && spec.ageMin > spec.ageMax)))
      return "Select eligible countries and check the age range.";
    if (step === 5 && (!goodDate(draft.deadline) || spec.selectionCriteria.trim().length < 10))
      return "Enter a future application deadline and selection criteria.";
  }
  if (draft.questions.filter(q => q.type === "FILE_UPLOAD").length > 10)
    return "An application can require up to 10 file uploads.";
  return null;
}


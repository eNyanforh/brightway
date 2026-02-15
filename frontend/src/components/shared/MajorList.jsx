import React from "react";
import styled from "styled-components";

const majorOptions = {
    "None": ["No Major"],
  "STEM (Science & Tech)": [
    "Computer Science",
    "Information Technology",
    "Software Engineering",
    "Data Science",
    "Cybersecurity",
    "Mathematics",
    "Biology",
    "Chemistry",
    "Physics",
    "Engineering",
  ],
  "Business & Management": [
    "Accounting",
    "Business Administration",
    "Finance",
    "Marketing",
    "Economics",
    "Human Resource Management",
  ],
  "Social Sciences": [
    "Psychology",
    "Sociology",
    "Political Science",
    "International Relations",
    "Geography",
    "Social Work",
  ],
  "Arts & Humanities": [
    "English Literature",
    "Philosophy",
    "History",
    "Fine Arts",
    "Religious Studies",
  ],
  "Health & Medicine": [
    "Nursing",
    "Public Health",
    "Pharmacy",
    "Medical Laboratory Science",
    "Nutrition",
  ],
  "Education": [
    "Primary Education",
    "Secondary Education",
    "Early Childhood Education",
    "Special Education",
  ],
  "Media & Communication": [
    "Mass Communication",
    "Journalism",
    "Public Relations",
    "Digital Media",
  ],
  "Agriculture & Environment": [
    "Agriculture",
    "Animal Science",
    "Forestry",
    "Fisheries & Aquaculture",
    "Environmental Science",
  ],
  "Design & Applied Arts": [
    "Graphic Design",
    "Interior Design",
    "Architecture",
    "Fashion Design",
  ],
  "Law & Legal Studies": [
    "Law",
    "Legal Studies",
    "Criminal Justice",
  ],

  "Vocational & Technical" :[
  "Automotive Technology",
  "HVAC (Heating, Ventilation, Air Conditioning)",
  "Electrical Technology",
  "Plumbing",
  "Welding Technology",
  "Carpentry",
  "Construction Technology",
  "Diesel Mechanics",
  "Industrial Maintenance",
  "Machining/CNC Technology",
  "Robotics Technology",
  "Solar Panel Installation",
  "Wind Turbine Technology",
  
  "Cosmetology",
  "Barbering",
  "Esthetics/Skin Care",
  "Nail Technology",
  "Massage Therapy",
  
  "Culinary Arts",
  "Baking & Pastry Arts",
  "Hospitality Management",
  "Restaurant Management",
  
  "Medical Assisting",
  "Dental Assisting",
  "Pharmacy Technician",
  "Medical Billing & Coding",
  "Healthcare Administration",
  "Patient Care Technician",
  "Emergency Medical Technician (EMT)",
  
  "Information Technology",
  "Computer Networking",
  "Cybersecurity",
  "Computer Repair",
  "Web Development",
  "Graphic Design",
  "Digital Media Production",
  
  "Aviation Maintenance",
  "Aircraft Mechanics",
  "Drone Technology",
  
  "Commercial Driving (CDL)",
  "Maritime Technology",
  "Railroad Technology",
  
  "Fire Science",
  "Law Enforcement",
  "Corrections Officer Training",
  
  "Early Childhood Education",
  "Teacher Assistant",
  "Special Education Assistant",
  
  "Fashion Design",
  "Interior Design",
  "Floral Design",
  
  "Agriculture Technology",
  "Veterinary Assistant",
  "Equine Science",
  
  "Manufacturing Technology",
  "Quality Control",
  "Industrial Safety",
  
  "Renewable Energy Technology",
  
  "Water Treatment Technology",
    "Project Management (PMP)",
    "Digital Marketing Certification",
    "Human Resources Certification",
    "Data Analytics Certification",
    "Cloud Computing Certification",
    "Cybersecurity Certification",
    "Scrum Master Certification",
    "Financial Planning Certification",
    "Medical Coding Certification",
    "Real Estate Licensing",
    "Teaching Certification",
    "Public Safety Certification",
    "Medical Assisting",
    "Dental Hygiene",
    "Phlebotomy Certification",
    "EMT/Paramedic Training",
    "Medical Billing & Coding",
    "Physical Therapy Assistant",
    "Graphic Design Certification",
    "UX/UI Design Certification",
    "Video Production Training",
    "Photography Certification",
    "Interior Design Certification",

    "Culinary Arts Certification",
    "Pastry Arts Certification",
    "Hotel Management",
    "Sommelier Training",
    "Event Planning Certification",
  

  
  "Other Vocational Training" // Always include an "Other" option
]
};

export default function MajorSelect({ value, onChange, schoolType }) {
  // Filter categories based on school type
  const filteredOptions = schoolType === "vocational" 
    ? { "Vocational & Technical": majorOptions["Vocational & Technical"] } 
    : Object.fromEntries(
        Object.entries(majorOptions).filter(([key]) => key !== "Vocational & Technical")
      );

  return (
    <Select onChange={(e) => onChange(e.target.value)} value={value}>
      <option value="">
        {schoolType === "vocational" 
          ? "Select your vocational specialization..." 
          : "What is your major..."}
      </option>
      {Object.entries(filteredOptions).map(([category, majors]) => (
        <optgroup key={category} label={category}>
          {majors.map((major) => (
            <option key={major} value={major}>
              {major}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}


// Styled Component
const Select = styled.select`
  width: 100%;
  padding: 0.75rem 2.5rem 0.75rem 1rem; /* extra right padding for arrow */
  border-radius: 30px;
  border: 1.5px solid #ccc;
  font-size: 1rem;
  margin-top: 1rem;
 
  color: gray;
  font-weight: 600;
  font-family: "Inter", sans-serif;

  /* Remove default arrow */
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;

  /* Custom arrow using CSS */
  background-image: url("data:image/svg+xml;utf8,<svg fill='%23374151' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  background-size: 1rem;
  background-color: rgba(217, 217, 217, 0.3);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.08);

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: #eff6ff;
    color:black;
  }
`;


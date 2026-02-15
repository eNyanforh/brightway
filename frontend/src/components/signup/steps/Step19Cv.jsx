import React, { useState, useEffect } from "react";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import BackButton from "../../shared/BackButton";
import { FaTrashAlt } from "react-icons/fa";
import styled from "styled-components";

const allowedFileTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const maxFileSizeMB = 5;

export default function Step19Cv({ onNext, onBack, formData }) {
  const [cvFile, setCvFile] = useState(formData.cvFile || null);
  const [noProof, setNoProof] = useState(formData.noProof || false); // ✅ fixed
  const [error, setError] = useState("");

  // Determine if Next button should be disabled
  const isNextDisabled = !cvFile && !noProof;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!allowedFileTypes.includes(file.type)) {
      setError("Only PDF or Word documents are allowed");
      setCvFile(null);
      return;
    }

    if (file.size > maxFileSizeMB * 1024 * 1024) {
      setError(`Maximum file size is ${maxFileSizeMB}MB`);
      setCvFile(null);
      return;
    }

    setError("");
    setCvFile(file);
    setNoProof(false);
  };

  const handleNext = () => {
    if (isNextDisabled) return; // Extra safeguard
    
    setError("");
    onNext({ ...formData, cvFile, noProof });
  };

  useEffect(() => {
  const handleEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!isNextDisabled) handleNext();
    }
  };

  window.addEventListener("keydown", handleEnter);
  return () => window.removeEventListener("keydown", handleEnter);
}, [cvFile, noProof, isNextDisabled]);

  return (
    <>
      
        <FormHeaderBlock title="Upload your Curriculum Vitae" />
        
        <UploadWrapper>
          <FileUploadLabel htmlFor="file-upload" disabled={noProof}>
            {cvFile ? "Change File" : "Upload CV Here"}
          </FileUploadLabel>
          <HiddenInput
            id="file-upload"
            type="file"
            accept=".pdf,.doc,.docx"
            disabled={noProof}
            onChange={handleFileChange}
          />
          
          {cvFile && (
            <FileInfoContainer>
              <span>Selected: {cvFile.name}</span>
              <DeleteIcon onClick={() => setCvFile(null)} title="Remove file">
                <FaTrashAlt color="white" size={14} />
              </DeleteIcon>
            </FileInfoContainer>
          )}
          
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </UploadWrapper>
        
        <CheckboxWrapper>
          <input
            type="checkbox"
            checked={noProof}
            onChange={(e) => {
              const checked = e.target.checked;
              setNoProof(checked);
              if (checked) setCvFile(null);
            }}
            id="no-proof-checkbox"
          />
          <label htmlFor="no-proof-checkbox">
            I don't have my cv/resume now
          </label>
        </CheckboxWrapper>

        <NextButton 
          onClick={handleNext}
          disabled={isNextDisabled}
          style={{
            
            cursor: isNextDisabled ? "not-allowed" : "pointer"
          }}
        >
          Next
        </NextButton>
        <BackButton onClick={onBack}>Back</BackButton>
    </>
  );
}

// Styled Components (remain the same)
const UploadWrapper = styled.div`
  width: 100%;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const HiddenInput = styled.input`
  display: none;
`;

const FileUploadLabel = styled.label`
  display: inline-block;
  margin: 0 auto;
  padding: 0.6rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: white;
  background-color: ${({ disabled }) => (disabled ? "#94a3b8" : "#3b82f6")};
  border-radius: 6px;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  text-align: center;
  transition: background-color 0.3s ease;
  width: fit-content;

  &:hover {
    background-color: ${({ disabled }) => (disabled ? "#94a3b8" : "#2563eb")};
  }
`;

const FileInfoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.9rem;
`;

const DeleteIcon = styled.span`
  background-color: #007bff;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
`;

const ErrorMsg = styled.p`
  color: #ff6666;
  margin-top: 0.5rem;
  font-weight: bold;
  text-align: center;
`;

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #000;
  font-size: 0.9rem;
  max-width: 350px;
  font-weight: 600;
  margin: 1rem auto;
  justify-content: center;

  input {
    width: 18px;
    height: 18px;
    cursor: pointer;
    text-align: center;
  }

  label {
    cursor: pointer;
  }
`;
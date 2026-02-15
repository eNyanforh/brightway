import React, { useRef, useState, useEffect } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import { FaCamera, FaTrash } from "react-icons/fa";

export default function Step9ProfilePic({ onNext, onBack, formData = {} }) {
  const fileInputRef = useRef(null);

  const [imagePreview, setImagePreview] = useState(formData.profilePicture || null);
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (!validTypes.includes(file.type)) {
      setError("Only JPG, PNG or WEBP files are allowed.");
      return;
    }

    if (file.size > maxSize) {
      setError("File size should be less than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
      setImageFile(file);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const handleNext = () => {
    if (!imagePreview) return;
    onNext({ ...formData, profilePicture: imagePreview });
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setImagePreview(null);
    setImageFile(null);
  };

  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter" && imagePreview) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [imagePreview]);

  return (
    <>
      <FormHeaderBlock title="Add your profile photo" />

      <UploadContainer onClick={() => fileInputRef.current.click()} role="button" tabIndex="0">
        {imagePreview ? (
          <>
            <ProfileImage src={imagePreview} alt="Profile preview" />
            <RemoveButton onClick={handleRemove}>
              <FaTrash />
            </RemoveButton>
          </>
        ) : (
          <Placeholder>
            <FaCamera />
            <UploadText>Tap to upload a photo</UploadText>
          </Placeholder>
        )}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </UploadContainer>

      {error && <ErrorText>{error}</ErrorText>}

      <NextButton disabled={!imagePreview} onClick={handleNext}>
        Next
      </NextButton>
      {onBack && <NextButton onClick={onBack} style={{ marginTop: "0.5rem", background: "#ccc" }}>Back</NextButton>}
    </>
  );
}

// Styled Components
const UploadContainer = styled.div`
  margin:1rem auto;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  border: 2px dashed #94a3b8;
  background-color: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: border-color 0.3s;

  &:hover { border-color: #3b82f6; }
  &:focus { outline: 2px solid #3b82f6; }
`;

const Placeholder = styled.div`
  text-align: center;
  color: #94a3b8;
  font-size: 1rem;

  svg { font-size: 1.8rem; margin-bottom: 0.5rem; }
`;

const UploadText = styled.p`
  font-size: 0.85rem;
  color: #94a3b8;
`;

const ProfileImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const RemoveButton = styled.button`
  position: absolute;
  top: -8px;
  right: -8px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 999px;
  padding: 0.4rem;
  font-size: 0.75rem;
  cursor: pointer;

  &:hover { background: #dc2626; }
`;

const ErrorText = styled.p`
  color: #ef4444;
  font-size: 0.85rem;
  margin-top: 0.5rem;
`;

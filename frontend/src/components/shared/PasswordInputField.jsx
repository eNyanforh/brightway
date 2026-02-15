// components/shared/PasswordInputField.js
import React, { useState } from "react";
import styled from "styled-components";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import TextInputField from "./TextInputField";

export default function PasswordInputField({ 
  placeholder, 
  value, 
  onChange 
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <PasswordWrapper>
      <TextInputField
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{ paddingRight: "2.5rem" }} // Adjust padding for icon
      />
      {value && (
        <Toggle onClick={() => setShowPassword(!showPassword)}>
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </Toggle>
      )}
    </PasswordWrapper>
  );
}

// Styles
const PasswordWrapper = styled.div`
  position: relative;
  width: 100%;
//   margin-top: 0.8rem;
`;

const Toggle = styled.span`
  position: absolute;
  right: 1rem;
  top: 65%;
  transform: translateY(-50%);
  cursor: pointer;
  color: #3b82f6;
  font-size: 1.25rem;
`;

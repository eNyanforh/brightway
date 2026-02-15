import React, { useRef, useEffect } from "react";
import PhoneInput from "react-phone-input-2";
import styled from "styled-components";
import 'react-phone-input-2/lib/style.css';

const PhoneWrapper = styled.div`
  .form-control {
    width: 100% !important;
    border-radius: 30px !important;
    padding: 22px 50px !important;
    background-color: rgba(217, 217, 217, 0.4) !important;
    color: #000 !important;
    font-weight: 600 !important;
    font-size: 1rem !important;
    border: 1px solid #ccc;
    transition: all 0.2s ease;

    &:focus {
      outline: none;
      border: 1.5px solid #3b82f6;
      background-color: rgba(217, 217, 217, 0.5);
      box-shadow: 0 0 6px rgba(59, 130, 246, 0.3);
    }
  }
`;

export default function PhoneInputField({ value, onChange, countryCode, error, shakeError, placeholderMap }) {
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus the input after mount
    if (inputRef.current) {
      const inputEl = inputRef.current.querySelector("input");
      inputEl && inputEl.focus();
    }
  }, []);

  return (
    <PhoneWrapper style={{ marginBottom: "0.5rem", width: "100%" }} ref={inputRef}>
      <PhoneInput
        name="phone"
        countryCodeEditable={false}
        country={countryCode}
        value={value}
        onChange={onChange}
        placeholder={placeholderMap[countryCode] || "Enter phone"}
        enableSearch
      />
      {error && <p style={{ color: "#dc2626", marginTop: "0.4rem" }}>{error}</p>}
    </PhoneWrapper>
  );
}

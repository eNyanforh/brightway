import React, { useState, useEffect, useRef } from "react";
import ProgressBar from "../components/shared/ProgressBar";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Link } from "react-router-dom";
import styled, { keyframes } from "styled-components";
import TextInputField from "./shared/TextInputField";

import { Container } from "../components/shared/Layout";
import PhoneInput from "react-phone-input-2";
import 'react-phone-input-2/lib/style.css';
import FormDivider from "../components/shared/FormDivider";
import SocialButton from "../components/shared/SocialButton";
import FormHeaderBlock from "../components/shared/FormHeaderBlock";
import { NextButton } from "../components/shared/NextButton";
import { Hero, FormContainer, FormDetail, Agreement } from "../components/shared/FormLayout";

const shake = keyframes`
  0% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
  100% { transform: translateX(0); }
`;

const ErrorMessage = styled.p`
  color: #dc2626;
  font-size: 0.8rem;
  margin-top: 0.25rem;
  text-align: left;
  animation: ${({ shakeError }) => (shakeError ? `${shake} 0.4s ease` : "none")};
`;

const ToggleText = styled.p`
  font-size: 0.85rem;
  color: #007bff;
  cursor: pointer;
  margin-top: 0.5rem;
  text-align: center;
  &:hover {
    text-decoration: underline;
  }
`;

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

const placeholders = {
  lr: "770123456",
  ng: "8031234567",
  us: "2015550123",
  gb: "7911123456",
};

export default function SignupStep1({ onNext }) {
  const [useEmail, setUseEmail] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [countryCode, setCountryCode] = useState("lr");
  const [error, setError] = useState("");
  const [shakeError, setShakeError] = useState(false);
  const [isValid, setIsValid] = useState(false);

  const phoneRef = useRef(null);
  const emailRef = useRef(null);

  const validatePhoneNumber = (phone, countryCode) => {
    const cleaned = phone.replace(/\s/g, "");
    const parsed = parsePhoneNumberFromString(cleaned.startsWith("+") ? cleaned : "+" + cleaned);
    if (!parsed || !parsed.isValid()) return false;
    if (countryCode === "lr") {
      const national = parsed.nationalNumber.toString();
      return /^(77|88|55)[0-9]{7}$/.test(national);
    }
    return true;
  };

  const validateEmail = (email) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);

  const handleNext = () => {
    if (useEmail) {
      if (!validateEmail(emailValue)) {
        setError("Please enter a valid email address.");
        setShakeError(true);
        setTimeout(() => setShakeError(false), 400);
        return;
      }
      setError("");
    onNext({ contact: emailValue });
    } else {
      const cleaned = phoneValue.replace(/\s/g, "");
      if (!validatePhoneNumber(cleaned, countryCode)) {
        setError(
          countryCode === "lr"
            ? "Liberian numbers must be 9 digits and start with 77, 88, or 55."
            : "Invalid phone number."
        );
        setShakeError(true);
        setTimeout(() => setShakeError(false), 400);
        return;
      }
      setError("");
       onNext({ contact: cleaned.startsWith("+") ? cleaned : "+" + cleaned });
    }
  };

  // Handle Enter key
  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (isValid) handleNext();
      }
    };
    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [isValid, useEmail, phoneValue, emailValue, countryCode]);

  // Autofocus
  useEffect(() => {
    if (useEmail && emailRef.current) {
      emailRef.current.focus();
    } else if (!useEmail && phoneRef.current) {
      const inputEl = phoneRef.current.querySelector("input");
      inputEl && inputEl.focus();
    }
  }, [useEmail]);

  // Live validation
  useEffect(() => {
    if (useEmail) {
      setIsValid(validateEmail(emailValue));
      if (emailValue && !validateEmail(emailValue)) setError("Please enter a valid email address.");
      else setError("");
    } else {
      const valid = validatePhoneNumber(phoneValue, countryCode);
      setIsValid(valid);
      if (phoneValue && !valid) setError("Invalid phone number.");
      else setError("");
    }
  }, [phoneValue, emailValue, countryCode, useEmail]);

  return (
    <Container>
      <Hero>
        <FormContainer>
          <FormHeaderBlock title="Let's get started" />
          <ProgressBar currentStep={1} totalSteps={7} />
          <FormDetail>

            {useEmail ? (
              <div style={{ width: "100%" }}>
                <TextInputField
                  placeholder="Email Address"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  ref={emailRef}
                  autoFocus
                />
                {error && <ErrorMessage shakeError={shakeError}>{error}</ErrorMessage>}
                <ToggleText onClick={() => setUseEmail(false)}>Use Phone Number Instead</ToggleText>
              </div>
            ) : (
              <PhoneWrapper ref={phoneRef} style={{width:"100%"}}>
                <PhoneInput
                  name="phone"
                  countryCodeEditable={false}
                  country={countryCode}
                  value={phoneValue}
                  onChange={(val, countryData) => {
                    setPhoneValue(val);
                    setCountryCode(countryData.countryCode);
                  }}
                  placeholder={placeholders[countryCode] || "Enter phone"}
                  enableSearch
                />
                {error && <ErrorMessage shakeError={shakeError}>{error}</ErrorMessage>}
                <ToggleText onClick={() => setUseEmail(true)}>Use Email Instead</ToggleText>
              </PhoneWrapper>
            )}

            <FormDivider />

            <SocialButton icon="/google.svg" label="Continue with Google" onClick={() => console.log("Google login")} />
            {/* <SocialButton icon="/facebook.svg" label="Continue with Facebook" onClick={() => console.log("Facebook login")} /> */}

            <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
              Been here? <StyleLink to="/login"><span>Log In</span></StyleLink>
            </p>

            <Agreement>
              <p>
                By registering you agree to our <a href="/terms.html">Terms & Conditions</a> and{" "}
                <a href="/privacy.html">Privacy Notice</a>.
              </p>
            </Agreement>

            <NextButton onClick={handleNext} disabled={!isValid} type="submit">
              Continue
            </NextButton>

          </FormDetail>
        </FormContainer>
      </Hero>
    </Container>
  );
}

const StyleLink = styled(Link)`
span{
&:hover {
    color: #2563eb;
    transform: scale(1.01);
  }
}
`
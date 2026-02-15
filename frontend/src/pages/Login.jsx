import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Container } from "../components/shared/Layout";
import FormHeaderBlock from "../components/shared/FormHeaderBlock";
import { NextButton } from "../components/shared/NextButton";
import { Hero, FormContainer, FormDetail } from "../components/shared/FormLayout";
import FormDivider from "../components/shared/FormDivider";
import SocialButton from "../components/shared/SocialButton";
import PhoneInputField from "../components/shared/PhoneInputField";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import styled from "styled-components";
import { FiEye, FiEyeOff } from "react-icons/fi";

const placeholders = {
  lr: "770123456",
  ng: "8031234567",
  us: "2015550123",
  gb: "7911123456",
};

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("lr");
  const [error, setError] = useState("");
  const [shakeError, setShakeError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validatePhoneNumber = (phone, countryCode) => {
    if (!phone) return false;
    try {
      const cleaned = phone.replace(/\s/g, "");
      const parsed = parsePhoneNumberFromString(cleaned, countryCode.toUpperCase());
      if (!parsed || !parsed.isValid()) return false;

      if (countryCode === "lr") {
        const national = parsed.nationalNumber.toString();
        return /^(77|88|55)[0-9]{7}$/.test(national);
      }

      return true;
    } catch {
      return false;
    }
  };

  const handleLogin = () => {
    if (!validatePhoneNumber(phone, countryCode)) {
      setError(
        countryCode === "lr"
          ? "Liberian numbers must start with 77, 88, or 55 and have 9 digits."
          : "Invalid phone number."
      );
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      return;
    }

    if (!password) {
      setError("Please enter your password");
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      return;
    }

    setError("");
    setShakeError(false);
    // TODO: Call your API login here
    console.log("Logging in with", phone, password);
  };

  return (
    <Container>
      <Hero>
        <FormContainer>
          <FormHeaderBlock title="Welcome back" />
          <FormDetail>
            <PhoneInputField
              value={phone}
              onChange={(val, countryData) => {
                setPhone(val);
                setCountryCode(countryData.countryCode);

                if (val && !validatePhoneNumber(val, countryData.countryCode)) {
                  setError(
                    countryData.countryCode === "lr"
                      ? "Liberian numbers must start with 77, 88, or 55 and have 9 digits."
                      : "Invalid phone number."
                  );
                } else {
                  setError("");
                }
              }}
              countryCode={countryCode}
              error={error}
              shakeError={shakeError}
              placeholderMap={placeholders}
            />

            <PasswordContainer>
  <PasswordInput
    type={showPassword ? "text" : "password"}
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    placeholder="Enter your password"
  />
  <TogglePassword onClick={() => setShowPassword(!showPassword)}>
    {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
  </TogglePassword>
</PasswordContainer>
            <Link to="/forgot-password">Forgot password?</Link>
            <FormDivider />

            {/* Social login buttons should handle OAuth */}
            <SocialButton icon="/google.svg" label="Continue with Google" onClick={() => alert("Google OAuth")} />
            <SocialButton icon="/facebook.svg" label="Continue with Facebook" onClick={() => alert("Facebook OAuth")} />

            <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
              New here? <Link to="/signup"><span>Create an account</span></Link>
            </p>

            <NextButton onClick={handleLogin}>Log In</NextButton>
          </FormDetail>
        </FormContainer>
      </Hero>
    </Container>
  );
}

// Styled Components
const PasswordContainer = styled.div`
  position: relative;
  width: 100%;
  margin-top: 1rem;
`;

const PasswordInput = styled.input`
  width: 100%;
  font-weight:bold;
  padding: 0.75rem 1rem;
  border-radius: 30px;
  border: 1.5px solid #ccc;
  font-size: 1rem;
  font-family: "Inter", sans-serif;
  background-color: rgba(217, 217, 217, 0.3);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background-color: #eff6ff;
  }
`;

const TogglePassword = styled.span`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: #3b82f6;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  margin: 0.5rem 0;
  font-size: 0.875rem;
  text-align: center;
  font-weight: 500;
`;

import React, { useState, useEffect } from "react";
import styled from "styled-components";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import { Link } from "react-router-dom";
import SixDigitCodeInput from "../../shared/SixDigitCodeInput";
import ProgressBar from "../../shared/ProgressBar";

const ResendButton = styled.button`
  margin-top: 1rem;
  font-weight: bold;
  background: none;
  border: none;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  color: ${({ disabled }) => (disabled ? "#999" : "#3b82f6")};
`;

const ChangeContactButton = styled.button`
  margin-top: 0.5rem;
  font-size: 0.9rem;
  background: none;
  border: none;
  cursor: pointer;
  color: #ef4444;

  &:hover {
    text-decoration: underline;
  }
`;

const WarningMessage = styled.div`
  margin-top: 0.75rem;
  color: #ef4444;
  font-size: 0.9rem;
`;

export default function Step2VerifyContact({
  onNext,
  onChangeContact,
  contact,
}) {
  const [sending, setSending] = useState(false);
  const [resendEnabled, setResendEnabled] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);
  const [warning, setWarning] = useState("");
  const [code, setCode] = useState("");

  // Countdown timer
  useEffect(() => {
    if (!resendEnabled && timeLeft > 0) {
      const timer = setInterval(
        () => setTimeLeft((prev) => prev - 1),
        1000
      );
      return () => clearInterval(timer);
    }

    if (timeLeft <= 0) {
      setResendEnabled(true);
    }
  }, [timeLeft, resendEnabled]);

  // Verify handler (FIXED)
  const handleVerify = () => {
    if (code.length !== 6) {
      setWarning("Please enter all 6 digits to verify.");
      return;
    }

    setWarning("");
    onNext({
      verificationCode: code, // ✅ OBJECT, NOT STRING
    });
  };

  // Resend handler
  const handleResend = () => {
    if (!resendEnabled || sending) return;

    setSending(true);
    setTimeout(() => {
      alert(`A new verification code has been sent to ${contact}`);
      setSending(false);
      setResendEnabled(false);
      setTimeLeft(120);
    }, 1000);
  };

  // Enter key support
  useEffect(() => {
    const handleEnter = (e) => {
      if (e.key === "Enter" && code.length === 6) {
        e.preventDefault();
        handleVerify();
      }
    };

    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [code]);

  return (
    <>
      <FormHeaderBlock
        title="Verify Contact"
        subTitle={
          <>
            Please enter the 6-digit code we sent to{" "}
            <strong>{contact || "your contact"}</strong>.
          </>
        }
      />

      <ProgressBar currentStep={2} totalSteps={7} />

      <SixDigitCodeInput
        onChange={setCode}
        onComplete={(val) => {
          setCode(val);
          setWarning("");
        }}
        warning={warning}
        setWarning={setWarning}
      />

      {warning && <WarningMessage>{warning}</WarningMessage>}

      <NextButton onClick={handleVerify} disabled={code.length !== 6}>
        Verify
      </NextButton>

      <ResendButton onClick={handleResend} disabled={!resendEnabled || sending}>
        {sending
          ? "Sending..."
          : resendEnabled
          ? "Resend code"
          : `Resend in ${Math.floor(timeLeft / 60)}:${String(
              timeLeft % 60
            ).padStart(2, "0")}`}
      </ResendButton>

      <ChangeContactButton onClick={onChangeContact}>
        Change number or email
      </ChangeContactButton>

      <Link to="/login">
        Been here before? <span>Log in</span>
      </Link>
    </>
  );
}

import React, { useState, useRef, useEffect } from "react";
import styled from "styled-components";

const CodeBoxContainer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 1rem 0;
`;

const CodeBox = styled.input`
  width: 45px;
  height: 50px;
  font-size: 24px;
  text-align: center;
  border: 1px solid #ccc;
  border-radius: 12px;
  background-color: rgba(217, 217, 217, 0.3);
  font-weight: bold;
  color: #000;

  &:focus {
    outline: none;
    border: 2px solid #3b82f6;
    background-color: rgba(217, 217, 217, 0.5);
  }
`;

const WarningText = styled.p`
  color: red;
  font-size: 14px;
  margin-top: -10px;
  margin-bottom: 1rem;
  text-align: center;
`;

export default function SixDigitCodeInput({
  length = 6,
  onComplete,
  warning,
  setWarning,
}) {
  const [code, setCode] = useState(Array(length).fill(""));
  const inputs = useRef([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const handleChange = (value, index) => {
    const numeric = value.replace(/\D/, "");
    if (!numeric) return;

    const newCode = [...code];
    newCode[index] = numeric;
    setCode(newCode);
    setWarning?.("");

    if (index < length - 1) {
      inputs.current[index + 1]?.focus();
    }

    const fullCode = newCode.join("");
    if (fullCode.length === length && !newCode.includes("")) {
      onComplete?.(fullCode);
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace") {
      const newCode = [...code];
      newCode[index] = "";
      setCode(newCode);
      setWarning?.("");
      if (index > 0) inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted.length === length) {
      const chars = pasted.split("");
      setCode(chars);
      chars.forEach((char, idx) => {
        if (inputs.current[idx]) {
          inputs.current[idx].value = char;
        }
      });
      setTimeout(() => inputs.current[length - 1]?.focus(), 10);
      onComplete?.(pasted);
    }
  };

  return (
    <>
      <CodeBoxContainer>
        {code.map((digit, i) => (
          <CodeBox
            key={i}
            type="text"
            maxLength={1}
            value={digit}
            ref={(el) => (inputs.current[i] = el)}
            onChange={(e) => handleChange(e.target.value, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onPaste={i === 0 ? handlePaste : undefined}
          />
        ))}
      </CodeBoxContainer>

      {warning && <WarningText>{warning}</WarningText>}
    </>
  );
}

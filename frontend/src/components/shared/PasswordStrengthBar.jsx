import React from "react";
import styled from "styled-components";

export default function PasswordStrengthBar({ password }) {
  const getStrength = (pwd) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++; // any special char

    if (strength <= 2) return { label: "Weak", color: "#ef4444", width: "33%" };
    if (strength === 3 || strength === 4)
      return { label: "Medium", color: "#f97316", width: "66%" };
    if (strength === 5) return { label: "Strong", color: "#22c55e", width: "100%" };
    return { label: "", color: "", width: "0%" };
  };

  const strength = getStrength(password);

  if (!password) return null;

  return (
    <Container>
      <Bar style={{ backgroundColor: strength.color, width: strength.width }} />
      <Label style={{ color: strength.color }}>{strength.label}</Label>
    </Container>
  );
}

// Styled Components
const Container = styled.div`
  margin-top: 0.4rem;
  width: 100%;
  max-width: 350px;
`;

const Bar = styled.div`
  height: 6px;
  border-radius: 20px;
  transition: width 0.3s;
`;

const Label = styled.div`
  margin-top: 0.2rem;
  color: #475569;
  font-weight: 600;
  font-size: 0.85rem;
  text-align: left;
`;

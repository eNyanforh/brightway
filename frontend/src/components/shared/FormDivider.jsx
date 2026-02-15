import React from "react";
import styled from "styled-components";

const DividerContainer = styled.div`
  display: flex;
  width: 100%;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
  gap: 0.5rem;
  align-items: center;
  color: #444;
  font-size: 0.9rem;
`;

const Line = styled.div`
  flex: 1;
  border: 0.5px solid #d1d5db;
`;

export default function FormDivider() {
  return (
    <DividerContainer>
      <Line />
      <p>OR</p>
      <Line />
    </DividerContainer>
  );
}

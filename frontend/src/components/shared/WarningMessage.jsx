import React from "react";
import styled, { keyframes } from "styled-components";
import { AiOutlineWarning } from "react-icons/ai";

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Message = styled.p`
  color: red;
  font-size: 14px;
  margin: 10px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  animation: ${fadeIn} 0.3s ease forwards;
  text-align: center;
`;

export default function WarningMessage({ message }) {
  return (
    <Message>
      <AiOutlineWarning size={18} />
      {message}
    </Message>
  );
}

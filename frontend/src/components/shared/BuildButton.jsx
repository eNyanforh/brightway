import React from "react";
import styled, { keyframes } from "styled-components";

export default function BuildCampusButton({ onClick, iconType = "plus" }) {
  return (
    <Button onClick={onClick}>
      <Icon>{iconType === "plus" ? "+" : "×"}</Icon>
      Build Campus
    </Button>
  );
}

/* Border gradient animation */
const borderAnimation = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const Button = styled.button`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 28px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  color: black;
  background: linear-gradient(270deg, #00ffb7ff, #0062ffac); /* Stable background */
  border: 5px solid transparent;
  cursor: pointer;
  z-index: 0;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
  }

  /* Animated gradient border */
  &::before {
    content: "";
    position: absolute;
    top: -3px;
    left: -3px;
    right: -3px;
    bottom: -3px;
    border-radius: 999px;
    background: white;
    background-size: 800% 800%;
    animation: ${borderAnimation} 6s ease infinite;
    z-index: -1;
  }
`;

const Icon = styled.span`
  font-size: 1.1rem;
  font-weight: bold;
`;

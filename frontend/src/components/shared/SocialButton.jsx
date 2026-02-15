import React from "react";
import styled from "styled-components";

const Button = styled.button`
  background-color: rgba(217, 217, 217, 0.4);
  background-image: ${({ icon }) => `url(${icon})`};
  background-repeat: no-repeat;
  background-position: left 1.2rem center;
  background-size: 1.4rem;
  color: #111;
  border: 2px solid #3b82f6;
  width: 100%;
  padding: 0;
  height: 50px;
  border-radius: 30px;
  font-size:1rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: all 0.2s ease;

  &:hover {
    border: 2.5px solid #3b82f6;
    background-color: rgba(217, 217, 217, 0.6);
    transform: scale(1.01);
  }
`;

export default function SocialButton({ icon, label, onClick }) {
  return (
    <Button icon={icon} onClick={onClick}>
      {label}
    </Button>
  );
}

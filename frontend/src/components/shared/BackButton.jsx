// components/shared/BackButton.js
import styled from "styled-components";
import { NextButton } from "./NextButton";

const BackButton = styled(NextButton)`
max-width: 350px;
  color: #3b82f6;
  padding:0 0;

  background-color: transparent;
  transition: background-color 0.3s ease;

  &:hover {
  background-color:transparent;
  
    color: #2563eb;
    font-weight: 600;
  }
`;

export default BackButton;

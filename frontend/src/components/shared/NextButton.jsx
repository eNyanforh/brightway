
import styled from "styled-components";

export const NextButton = styled.button`
  padding: 0.9rem 6rem;
  font-size: 1rem;
  border-radius: 30px;
  margin-top: 1rem;
  border: none;
  width: 100%;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  background-color: #3b82f6;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: #2563eb;
    transform: scale(1.01);
  }

  &:disabled {
    background-color: #9ca3af;
    cursor: not-allowed;
    transform: none;
  }
`;
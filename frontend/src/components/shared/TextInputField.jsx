// components/shared/TextInputField.js
import styled from "styled-components";

const TextInputField = styled.input`
display:flex;
margin:0.5rem;
  width: 100%;
  padding: 12px 16px;
  border-radius: 30px;
  border: 1px solid #ccc;
  background-color: rgba(217, 217, 217, 0.3);
  font-size: 1rem;
  font-weight: 600;
  color: #000;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.08);
  font-family: "Inter", sans-serif;

  &::placeholder {
    color: #999;
  }

  &:focus {
    outline: none;
    border: 1.5px solid #3b82f6;
    background-color: rgba(217, 217, 217, 0.5);
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.3);
  }
`;

export default TextInputField;

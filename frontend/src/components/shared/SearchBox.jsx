// components/SearchBox.js
import React, { useState } from "react";
import styled from "styled-components";
import { Search, X } from "lucide-react";

const Wrapper = styled.div`
  width: 100%;
  
  position: relative;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 40px 8px 42px; /* extra right padding for X button */
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  font-size: 15px;
  outline: none;
  transition: all 0.25s ease;
  background: #f9fafb;

  &:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    background: #fff;
    font-family:"Inter";
    font-weight:400;
  }
`;

const Icon = styled(Search)`
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: #9ca3af;
`;

const ClearButton = styled.button`
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;

  &:hover {
    color: #374151;
  }
`;

export default function SearchBox({ placeholder = "Search..." }) {
  const [value, setValue] = useState("");

  return (
    <Wrapper>
      <Icon />
      <Input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <ClearButton onClick={() => setValue("")}>
          <X size={18} />
        </ClearButton>
      )}
    </Wrapper>
  );
}

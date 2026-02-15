import React, { useMemo } from "react";
import Select from "react-select";
import countryList from "react-select-country-list";
import styled from "styled-components";

export default function CountrySelect({ value, onChange }) {
  const options = useMemo(() => countryList().getData(), []);

  const handleChange = (selected) => {
    onChange(selected.label); // or use `selected.value` if you want ISO codes
  };

  return (
    <SelectCountries
      options={options}
      value={options.find((option) => option.label === value)}
      onChange={handleChange}
      placeholder="Select country of school location"
      isSearchable
      autoFocus
      styles={{
        control: (base) => ({
          ...base,
          borderRadius: "30px",
          borderColor: "#ccc",
          padding: "5px 0px",
          fontSize: "1rem",
        }),
      }}
    />
  );
}

const SelectCountries = styled(Select) `
 width: 100%;
  margin-top: 1rem;
  
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

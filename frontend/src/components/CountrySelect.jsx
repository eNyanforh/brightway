import React from "react";
import Select from "react-select";
import { countries } from "./countries";

const customStyles = {
  control: (provided) => ({
    ...provided,
    backgroundColor: "white",
    border: "none",
    borderRadius: "20px",
    paddingLeft:"1rem",
    boxShadow: "none",
    color: "white",
    fontWeight: "bold",
    width: "300px"
  }),
  singleValue: (provided) => ({
    ...provided,
    color: "white",
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: "white",
    borderRadius: "8px",
    zIndex: 9999,
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isFocused ? "#3B82F6" : "white",
    color: state.isFocused ? "white" : "black",
    cursor: "pointer",
  }),
  placeholder: (provided) => ({
    ...provided,
    color: "#3B82F6",
  }),
  input: (provided) => ({
    ...provided,
    color: "#3B82F6",
  }),
};


// react-select expects options as array of { value, label }
const options = countries.map((country) => ({
  value: country.code,
  label: (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <img
        src={`https://flagcdn.com/w20/${country.code.toLowerCase()}.png`}
        alt={country.name}
        style={{ width: "20px" }}
        isSearchable ={true}
      />
      <span>
        {country.name} ({country.dialCode})
      </span>
    </div>
  ),
}));

export default function CountrySelect({ value, onChange }) {
  return (
    <Select
      options={options}
      value={options.find((o) => o.value === value) || null}
      onChange={(selected) => onChange(selected?.value)}
      placeholder="Select your country"
      styles={customStyles}
    />
  );
}

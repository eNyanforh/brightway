import React from "react";

export default function YearInput({ value, onChange }) {
  return (
    <input
      type="number"
      min="1900"
      max="2100"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter Year"
    />
  );
}

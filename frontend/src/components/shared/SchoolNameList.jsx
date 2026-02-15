import React from "react";

export default function SchoolNameList({ value, onChange }) {
  // Minimal dropdown example
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select School Name</option>
      <option value="School A">School A</option>
      <option value="School B">School B</option>
      {/* Add more as needed */}
    </select>
  );
}

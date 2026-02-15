// SchoolFormList.js
import React from "react";

function SchoolForm({ index, level, data, onChange, onRemove, optional }) {
  const handleChange = (field, value) => {
    onChange(index, { ...data, [field]: value });
  };

  return (
    <div className="school-form-entry">
      <h4>{level} {optional && "(Optional)"} - #{index + 1}</h4>

      {optional && (
        <label>
          <input
            type="checkbox"
            checked={data?.skipped || false}
            onChange={(e) => handleChange("skipped", e.target.checked)}
          />
          Skip this level
        </label>
      )}

      {!data?.skipped && (
        <>
          <div>
            <label>School Name</label>
            <input
              type="text"
              value={data?.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </div>

          <div>
            <label>Location</label>
            <input
              type="text"
              value={data?.location || ""}
              onChange={(e) => handleChange("location", e.target.value)}
            />
          </div>

          <div>
            <label>Start Year</label>
            <input
              type="number"
              value={data?.startYear || ""}
              onChange={(e) => handleChange("startYear", e.target.value)}
            />
          </div>

          <div>
            <label>End Year</label>
            <input
              type="number"
              value={data?.endYear || ""}
              onChange={(e) => handleChange("endYear", e.target.value)}
            />
          </div>

          <button type="button" onClick={() => onRemove(index)}>Remove</button>
        </>
      )}
    </div>
  );
}

export default function SchoolFormList({ level, optional, entries, onChange }) {
  const handleEntryChange = (index, updatedData) => {
    const updatedEntries = entries.map((entry, i) => 
      i === index ? updatedData : entry
    );
    onChange(updatedEntries);
  };

  const handleAddEntry = () => {
    onChange([...entries, {}]);
  };

  const handleRemoveEntry = (index) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className="school-form-list">
      <h3>{level} {optional && "(Optional)"}</h3>
      {entries.map((entry, index) => (
        <SchoolForm
          key={index}
          index={index}
          level={level}
          data={entry}
          onChange={handleEntryChange}
          onRemove={handleRemoveEntry}
          optional={optional}
        />
      ))}
      <button type="button" onClick={handleAddEntry}>
        Add Another {level}
      </button>
    </div>
  );
}

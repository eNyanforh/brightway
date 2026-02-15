// components/shared/DateSelector.js
import React from "react";
import styled from "styled-components";

const SelectsWrapper = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const Select = styled.select`
  flex: ${({ wide }) => (wide ? "2" : "1")};
  height: 50px;
  padding: 0 2.5rem 0 1rem; /* enough padding-right for arrow */
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
  background-color: rgba(217, 217, 217, 0.3);
  border: 1px solid #ccc;
  color: #000;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='14' height='8' viewBox='0 0 14 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L7 7L13 1' stroke='%23666' stroke-width='2'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  background-size: 12px;
  font-weight:bold;

  &:focus {
    outline: none;
    border: 2px solid #3b82f6;
    background-color: rgba(217, 217, 217, 0.5);
  }
`;

export default function DateSelector({
  months,
  days,
  years,
  selectedMonth,
  selectedDay,
  selectedYear,
  onMonthChange,
  onDayChange,
  onYearChange,
}) {
  return (
    <SelectsWrapper>
      <Select value={selectedMonth} onChange={onMonthChange} wide>
        {months.map((month, idx) => (
          <option key={month} value={idx}>
            {month}
          </option>
        ))}
      </Select>

      <Select value={selectedDay} onChange={onDayChange}>
        {days.map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </Select>

      <Select value={selectedYear} onChange={onYearChange}>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </Select>
    </SelectsWrapper>
  );
}

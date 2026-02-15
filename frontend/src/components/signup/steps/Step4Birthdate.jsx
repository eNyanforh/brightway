import React, { useState, useEffect } from "react";
import ProgressBar from "../../shared/ProgressBar";
import FormHeaderBlock from "../../shared/FormHeaderBlock";
import { NextButton } from "../../shared/NextButton";
import DateSelector from "../../shared/DateSelector";
import BackButton from "../../shared/BackButton";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const generateYears = (startYear, endYear) => {
  const years = [];
  for (let i = endYear; i >= startYear; i--) {
    years.push(i);
  }
  return years;
};

const generateDays = (month, year) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate(); // month is 0-indexed
  return Array.from({ length: daysInMonth }, (_, i) => i + 1);
};

export default function Step4Birthdate({ onNext, onBack, formData }) {
  const currentYear = new Date().getFullYear();
  const maxAllowedYear = currentYear - 9; // User must be at least 9 years old

  const years = generateYears(1900, maxAllowedYear);

  const [selectedMonth, setSelectedMonth] = useState(0);
  const [selectedYear, setSelectedYear] = useState(maxAllowedYear);
  const [selectedDay, setSelectedDay] = useState(1);
  const [days, setDays] = useState(generateDays(0, maxAllowedYear));
  const [isValid, setIsValid] = useState(true); // Next enabled if valid

  // Update days whenever month or year changes
  useEffect(() => {
    const newDays = generateDays(selectedMonth, selectedYear);
    setDays(newDays);

    if (selectedDay > newDays.length) {
      setSelectedDay(newDays.length);
    }
  }, [selectedMonth, selectedYear]);

  // Check age validity
  useEffect(() => {
    const birthday = new Date(selectedYear, selectedMonth, selectedDay);
    const ageDifMs = Date.now() - birthday.getTime();
    const ageDate = new Date(ageDifMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    setIsValid(age >= 9);
  }, [selectedDay, selectedMonth, selectedYear]);

  const handleNext = () => {
    if (!isValid) {
      alert("You must be at least 9 years old to sign up.");
      return;
    }

    onNext({
      ...formData,
      birthday: new Date(selectedYear, selectedMonth, selectedDay),
    });
  };

  useEffect(() => {
  const handleEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isValid) handleNext();
    }
  };

  window.addEventListener("keydown", handleEnter);
  return () => window.removeEventListener("keydown", handleEnter);
}, [selectedDay, selectedMonth, selectedYear, isValid]);


  return (
   <>
        <FormHeaderBlock title="What's your Birthdate?" />
        <ProgressBar currentStep={4} totalSteps={7} />
        <DateSelector
          months={months}
          days={days}
          years={years}
          selectedMonth={selectedMonth}
          selectedDay={selectedDay}
          selectedYear={selectedYear}
          onMonthChange={(e) => setSelectedMonth(parseInt(e.target.value))}
          onDayChange={(e) => setSelectedDay(parseInt(e.target.value))}
          onYearChange={(e) => setSelectedYear(parseInt(e.target.value))}
        />
        <NextButton onClick={handleNext} disabled={!isValid}>
          Next
        </NextButton>
        <BackButton onClick={onBack}>Back</BackButton>
     </>
  );
}

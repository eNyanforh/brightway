import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "../layout/NavigationIcon";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = value => String(value).padStart(2, "0");
const localDay = date => [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T12:00").getTime());

/** Shared native-date-time input with an accessible, brand-styled calendar. */
export default function OpportunityDateTimePicker({ value, onChange, label = "Deadline (your local time)", required = true }) {
  const id = useId();
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedDay = value?.slice(0, 10) || "";
  const [month, setMonth] = useState(() => {
    const date = selectedDay && validDay(selectedDay) ? new Date(selectedDay + "T12:00") : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const closeOutside = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: Math.ceil((firstWeekday + dayCount) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= dayCount ? day : null;
  });
  const now = new Date();
  const today = localDay(now);

  function choose(day) {
    const next = localDay(new Date(month.getFullYear(), month.getMonth(), day));
    onChange(next + "T" + (value?.slice(11, 16) || "12:00"));
    setOpen(false);
  }

  function changeMonth(offset) {
    setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));
  }

  return <div className="bw-op-date-picker" ref={root} onKeyDown={event => {
    if (open && event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
    }
  }}>
    <label htmlFor={id}>{label}</label>
    <div className="bw-op-date-input-wrap">
      <NavigationIcon name="calendar" size={19} />
      <input id={id} type="datetime-local" required={required} value={value || ""}
        onChange={event => onChange(event.target.value)} />
      <button type="button" className="bw-op-date-toggle" aria-label="Open deadline calendar"
        aria-expanded={open} aria-controls={id + "-calendar"}
        onClick={() => {
          if (!open) {
            const date = selectedDay && validDay(selectedDay) ? new Date(selectedDay + "T12:00") : new Date();
            setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          }
          setOpen(current => !current);
        }}>
        <NavigationIcon name="chevron-right" size={16} />
      </button>
    </div>
    {open && <div id={id + "-calendar"} className="bw-op-calendar" role="group" aria-label="Select deadline date and time">
      <div className="bw-op-calendar-header">
        <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>
          <NavigationIcon name="chevron-left" size={18} />
        </button>
        <strong>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
        <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>
          <NavigationIcon name="chevron-right" size={18} />
        </button>
      </div>
      <div className="bw-op-calendar-grid">
        {weekdays.map(day => <span className="bw-op-calendar-weekday" key={day}>{day}</span>)}
        {dates.map((day, index) => {
          if (day === null) return <span className="bw-op-calendar-blank" key={"blank-" + index} />;
          const date = localDay(new Date(month.getFullYear(), month.getMonth(), day));
          return <button type="button" key={date} aria-label={new Date(date + "T12:00").toLocaleDateString("en-US", { dateStyle: "full" })}
            className={(date === selectedDay ? "is-selected " : "") + (date === today ? "is-today" : "")}
            aria-pressed={date === selectedDay} disabled={date < today} onClick={() => choose(day)}>
            {day}
          </button>;
        })}
      </div>
      <div className="bw-op-calendar-bottom">
        <label htmlFor={id + "-time"}>Time</label>
        <input id={id + "-time"} type="time" value={value?.slice(11, 16) || "12:00"}
          onChange={event => onChange((validDay(selectedDay) ? selectedDay : today) + "T" + event.target.value)} />
        <button type="button" className="bw-op-calendar-today" onClick={() => {
          onChange(today + "T" + (value?.slice(11, 16) || "12:00"));
          setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
        }}>Today</button>
      </div>
    </div>}
  </div>;
}

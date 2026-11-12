import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import NavigationIcon from "../layout/NavigationIcon";

const choices = [
  ["ACHIEVEMENT", "awards", "Share an Achievement", "Celebrate progress and what you learned."],
  ["EVENT", "calendar", "Create an Event", "Bring your community together."],
  ["QUESTION", "question", "Ask a Question", "Learn from the community."],
];
export default function PurposefulPostChooser({ onSelect, onCancel, disabled }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previous; document.querySelector(".bw-mobile-compose-fab")?.focus(); };
  }, []);
  return createPortal(<dialog className="bw-purposeful-chooser" ref={dialog} aria-label="Create a post"
    onCancel={event => { event.preventDefault(); onCancel(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = [...dialog.current.querySelectorAll("button:not([disabled])")];
      if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
    }}>
    <header><h2>Share with purpose</h2><button type="button" aria-label="Close post choices" onClick={onCancel}>×</button></header>
    <p>Choose how you want to contribute.</p>
    {choices.map(([type, icon, title, description]) => <button key={type} className="bw-purposeful-choice" type="button" disabled={disabled} onClick={() => onSelect(type)}>
      <NavigationIcon name={icon} size={25} /><span><strong>{title}</strong><small>{description}</small></span><NavigationIcon name="chevron-right" size={20} />
    </button>)}
  </dialog>, document.body);
}

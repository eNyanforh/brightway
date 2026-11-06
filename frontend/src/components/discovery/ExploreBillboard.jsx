import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../layout/NavigationIcon";

const statusSlides = [
  {
    id: "challenges", label: "Current challenges", title: "Find your next challenge",
    description: "New challenges will appear here when they open.",
    href: "/opportunities", action: "Browse opportunities", icon: "opportunities",
  },
  {
    id: "winners", label: "Past challenge winners", title: "Celebrate the winners",
    description: "Challenge winners will be featured here after results are published.",
    icon: "awards",
  },
  {
    id: "campus", label: "Virtual Campus spotlight", title: "Recognize student achievement",
    description: "This spotlight will feature top-performing Virtual Campus students.",
    href: "/learning", action: "Explore learning", icon: "learning",
  },
];

function allowsMotion() {
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function ExploreBillboard({ slides = statusSlides }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(allowsMotion);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const slide = slides[index];

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!preference) return undefined;
    const stopForReducedMotion = event => { if (event.matches) setPlaying(false); };
    preference.addEventListener("change", stopForReducedMotion);
    return () => preference.removeEventListener("change", stopForReducedMotion);
  }, []);

  useEffect(() => {
    if (!playing || hovered || focused || slides.length < 2) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex(current => (current + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [playing, hovered, focused, slides.length]);

  function select(next) {
    setIndex((next + slides.length) % slides.length);
    setPlaying(false);
  }

  return (
    <section className="bw-explore-billboard" aria-label="BrightWay billboard" aria-roledescription="carousel"
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className="bw-billboard-stage" aria-live={playing ? "off" : "polite"}>
        <div className={`bw-billboard-slide bw-billboard-${slide.id}`} key={slide.id}
          role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}: ${slide.label}`}>
          <div className="bw-billboard-copy">
            <p className="bw-billboard-label">{slide.label}</p>
            <h2>{slide.title}</h2>
            <p className="bw-billboard-description">{slide.description}</p>
            {slide.href && <Link className="bw-billboard-cta" to={slide.href}>{slide.action} <span aria-hidden="true">↗</span></Link>}
          </div>
          <div className="bw-billboard-art" aria-hidden="true"><NavigationIcon name={slide.icon} size={56} /></div>
        </div>
      </div>
      {slides.length > 1 && (
        <div className="bw-billboard-controls">
          <div className="bw-billboard-dots" aria-label="Choose a slide">
            {slides.map((item, position) => (
              <button type="button" key={item.id} aria-label={item.label} aria-pressed={position === index} onClick={() => select(position)}><span /></button>
            ))}
          </div>
          <div className="bw-billboard-buttons">
            <button type="button" aria-label="Previous slide" onClick={() => select(index - 1)}><NavigationIcon name="chevron-left" size={18} /></button>
            <button type="button" aria-label={playing ? "Pause slideshow" : "Play slideshow"} onClick={() => setPlaying(current => !current)}><NavigationIcon name={playing ? "pause" : "play"} size={17} /></button>
            <button type="button" aria-label="Next slide" onClick={() => select(index + 1)}><NavigationIcon name="chevron-right" size={18} /></button>
          </div>
        </div>
      )}
    </section>
  );
}

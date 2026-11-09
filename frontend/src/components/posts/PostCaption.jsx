import { useId, useLayoutEffect, useRef, useState } from "react";

// Clamp by actual rendered lines, not a character count: cards have different widths.
export default function PostCaption({ body, className = "" }) {
  const id = useId();
  const paragraphRef = useRef(null);
  const wrapperRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const fullText = typeof body === "string" ? body : "";

  useLayoutEffect(() => {
    if (expanded) return undefined;
    const paragraph = paragraphRef.current;
    const wrapper = wrapperRef.current;
    if (!paragraph || !wrapper) return undefined;
    const measure = () => {
      // The clamped element retains its full scrollHeight.
      setOverflows(paragraph.scrollHeight > paragraph.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [fullText, expanded]);

  return (
    <div ref={wrapperRef} className="bw-post-caption">
      <p ref={paragraphRef} id={id}
        className={["bw-post-text", className, !expanded && "bw-post-caption--collapsed"].filter(Boolean).join(" ")}>
        {fullText}
      </p>
      {overflows && (
        <button type="button" className="bw-post-caption-toggle"
          aria-controls={id} aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}>
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}

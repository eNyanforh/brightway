import { useId, useState } from "react";
import { previewPostCaption } from "./post-caption-preview";

export default function PostCaption({ body, className = "" }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const { preview, shortened } = previewPostCaption(body);
  const fullText = typeof body === "string" ? body : "";

  return (
    <div className="bw-post-caption">
      <p id={id} className={["bw-post-text", className].filter(Boolean).join(" ")}>
        {expanded || !shortened ? fullText : preview}
        {shortened && !expanded && <span aria-hidden="true">…</span>}
      </p>
      {shortened && (
        <button type="button" className="bw-post-caption-toggle"
          aria-controls={id} aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}>
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

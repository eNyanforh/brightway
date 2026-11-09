import { useId, useState } from "react";

// Keep cards scannable while preserving the complete original caption.
export const CAPTION_PREVIEW_CHARACTERS = 280;
export const CAPTION_PREVIEW_LINES = 5;

export function previewPostCaption(value) {
  const text = typeof value === "string" ? value : "";
  const characters = Array.from(text);
  let end = Math.min(characters.length, CAPTION_PREVIEW_CHARACTERS);
  let lines = 1;
  for (let index = 0; index < end; index++) {
    if (characters[index] === "\n" && ++lines > CAPTION_PREVIEW_LINES) {
      end = index;
      break;
    }
  }
  if (end >= characters.length) return { preview: text, shortened: false };

  let preview = characters.slice(0, end).join("").trimEnd();
  // Avoid splitting an ordinary word near the character limit.
  if (end === CAPTION_PREVIEW_CHARACTERS && characters[end] && !/\s/u.test(characters[end])) {
    const space = preview.lastIndexOf(" ");
    if (space >= preview.length - 45 && space > 0) preview = preview.slice(0, space);
  }
  return { preview, shortened: true };
}

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

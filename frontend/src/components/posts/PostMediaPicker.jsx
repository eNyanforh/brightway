import { useRef, useState } from "react";
import { postMediaUrl } from "../../api/organization-posts";

const accepted = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "application/pdf"];
export default function PostMediaPicker({ media = [], disabled = false, uploading = false, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  async function choose(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    const bad = files.find(file => !accepted.includes(file.type)
      || !file.size || file.size > (file.type.startsWith("video/") ? 20 : 5) * 1024 * 1024);
    if (bad) return setError("Choose JPEG, PNG, WebP or PDF up to 5 MiB, or MP4/WebM video up to 20 MiB.");
    if (media.length + files.length > 4) return setError("You can attach up to four files per post.");
    if (media.filter(item => item.kind === "VIDEO").length
      + files.filter(file => file.type.startsWith("video/")).length > 1)
      return setError("Only one video can be attached per post.");
    if (media.filter(item => item.kind === "PDF").length
      + files.filter(file => file.type === "application/pdf").length > 1)
      return setError("Only one PDF can be attached per post.");
    setError("");
    await onUpload(files);
  }
  return (
    <div className="bw-post-media-picker" aria-label="Post media attachments">
      <div className="bw-post-media-picker-toolbar">
        <span><strong>Media</strong> <small>Images, video or document</small></span>
        <button type="button" disabled={disabled || uploading || media.length >= 4}
          onClick={() => inputRef.current?.click()}>
          {uploading ? "Uploading…" : "Add media"}
        </button>
        <input ref={inputRef} type="file" accept={accepted.join(",")} multiple
          aria-label="Choose post media files" disabled={disabled || uploading}
          onChange={event => void choose(event)} />
      </div>
      {media.length > 0 && (
        <ul className="bw-post-media-draft-list">
          {media.map(item => (
            <li key={item.id}>
              {item.kind === "IMAGE"
                ? <img src={postMediaUrl(item.id)} alt="" />
                : <span className="bw-post-media-draft-icon">{item.kind === "VIDEO" ? "▶" : "PDF"}</span>}
              <span className="bw-post-media-draft-name">{item.name}</span>
              <button type="button" disabled={disabled || uploading}
                aria-label={"Remove " + item.name} onClick={() => onRemove(item.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="bw-post-media-error">{error}</p>}
      <small>Up to 4 files · 1 video and 1 PDF maximum · Files are visible after publishing</small>
    </div>
  );
}

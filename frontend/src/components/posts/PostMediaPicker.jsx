import { useRef, useState } from "react";
import { organizationPostsApi, uploadPostMedia } from "../../api/organization-posts";
import NavigationIcon from "../layout/NavigationIcon";
import PostPhotoGallery from "./PostPhotoGallery";
import DocumentCarousel from "./DocumentCarousel";

const formats = [
  { key: "IMAGE", label: "Add photos", icon: "image", accept: "image/jpeg,image/png,image/webp" },
  { key: "VIDEO", label: "Add video", icon: "play", accept: "video/mp4,video/webm" },
  { key: "DOCUMENT", label: "Add PDF", icon: "file-text", accept: "application/pdf" },
];
const inferKind = file => file.type.startsWith("image/") ? "IMAGE"
  : file.type.startsWith("video/") ? "VIDEO"
  : file.type === "application/pdf" ? "DOCUMENT" : null;

export default function PostMediaPicker({
  media = [], disabled = false, onUploaded, onRemoved, onBusyChange,
}) {
  const inputs = useRef({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const locked = disabled || busy;

  async function pick(files) {
    if (locked || !files?.length) return;
    const selections = [...files];
    let staged = [...media];
    const kind = inferKind(selections[0]);
    if (!kind || selections.some(item => inferKind(item) !== kind) ||
        (staged.length && staged.some(item => item.kind !== kind)) ||
        (kind !== "IMAGE" && (selections.length !== 1 || staged.length)) ||
        (kind === "IMAGE" && staged.length + selections.length > 4)) {
      setError("Attach up to four photos, or one video, or one PDF per post.");
      return;
    }
    const invalid = selections.find(file => !file.type || file.size === 0 ||
      file.size > (kind === "VIDEO" ? 25 : 5) * 1024 * 1024);
    if (invalid) {
      setError(kind === "VIDEO" ? "Choose a video up to 25 MB." : "Choose a photo or PDF up to 5 MB.");
      return;
    }
    setError("");
    setBusy(true);
    onBusyChange?.(true);
    try {
      for (let i = 0; i < selections.length; i++) {
        setUploadNotice("Uploading " + (i + 1) + " of " + selections.length + "…");
        const result = await uploadPostMedia(selections[i]);
        staged = [...staged, result];
        onUploaded(result);
      }
      setUploadNotice("");
    } catch (failure) {
      setUploadNotice("");
      setError(failure.message || "Unable to upload this attachment.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function remove(file) {
    if (locked) return;
    setError("");
    setBusy(true);
    onBusyChange?.(true);
    try {
      await organizationPostsApi.discardPostMedia(file.id);
      onRemoved(file.id);
    } catch (failure) {
      setError(failure.message || "Could not remove the attachment.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="bw-post-media-picker" aria-label="Attach media to your post">
      <div className="bw-post-media-picker-tools">
        {formats.map(format => {
          const incompatible = media.length && media.some(item => item.kind !== format.key);
          const filled = media.length >= (format.key === "IMAGE" ? 4 : 1);
          return (
            <div className="bw-post-media-picker-action" key={format.key}>
              <input type="file" ref={element => { inputs.current[format.key] = element; }}
                accept={format.accept} multiple={format.key === "IMAGE"} hidden
                aria-label={"Choose " + format.label.toLowerCase()}
                onChange={event => {
                  const selected = event.target.files;
                  void pick(selected);
                  event.target.value = "";
                }} />
              <button type="button" disabled={locked || Boolean(incompatible) || Boolean(filled)}
                aria-label={format.label} onClick={() => inputs.current[format.key]?.click()}>
                <NavigationIcon name={format.icon} size={18} /> {format.label}
              </button>
            </div>
          );
        })}
      </div>
      <p className="bw-post-media-picker-hint">Up to 4 photos (5 MB each), or 1 video (25 MB), or 1 PDF (5 MB).</p>
      {media[0]?.kind === "IMAGE" && <div className="bw-photo-selection">
        <div className="bw-photo-selection-heading"><strong>Your photos</strong><span>{media.length} of 4 added</span></div>
        <PostPhotoGallery images={media} disabled={locked} onRemove={file => void remove(file)} />
        <p>Preview a photo to see it in full. Photos appear in the order you add them.</p>
      </div>}
      {media.length > 0 && media[0]?.kind !== "IMAGE" && <ul className="bw-post-media-picker-list" aria-label="Uploaded attachments">
        {media.map(file => (
          <li key={file.id}>
            <span aria-hidden="true" className="bw-post-media-picker-file-icon">{file.kind === "DOCUMENT" ? "PDF" : "VIDEO"}</span>
            <span className="bw-post-media-picker-file-name" title={file.name}>{file.name}</span>
            {file.kind === "DOCUMENT" && <small>{file.pageCount} pages</small>}
            <button type="button" aria-label={"Remove attachment " + file.name} disabled={locked}
              onClick={() => void remove(file)}>Remove</button>
          </li>
        ))}
      </ul>}
      {media[0]?.kind === "DOCUMENT" && <DocumentCarousel key={media[0].id} item={media[0]} />}
      {uploadNotice && <p role="status">{uploadNotice}</p>}
      {error && <p className="bw-post-media-picker-error" role="alert">{error}</p>}
    </section>
  );
}

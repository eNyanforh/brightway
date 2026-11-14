import { postMediaUrl } from "../../api/organization-posts";
import DocumentCarousel from "./DocumentCarousel";
import PostPhotoGallery from "./PostPhotoGallery";
import PostPhotoStage from "./PostPhotoStage";

const humanBytes = size => size >= 1024 * 1024
  ? (size / (1024 * 1024)).toFixed(1) + " MB"
  : Math.max(1, Math.ceil(size / 1024)) + " KB";

export default function PostMedia({ media, immersive = false, onOpen, photoIndex = 0, onSelectPhoto }) {
  if (!Array.isArray(media) || !media.length) return null;
  const images = media.filter(file => file.kind === "IMAGE");
  const video = media.find(file => file.kind === "VIDEO");
  const document = media.find(file => file.kind === "DOCUMENT");
  // The active slide may autoplay muted; respect accessibility and data-saving preferences.
  const autoplay = immersive && typeof window !== "undefined"
    && !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    && !window.navigator?.connection?.saveData;
  return (
    <div className="bw-post-media" aria-label="Post attachments">
      {images.length > 0 && (immersive
        ? <PostPhotoStage images={images} index={photoIndex} onSelect={onSelectPhoto} />
        : <PostPhotoGallery images={images} onOpen={onOpen} />)}
      {video && (
        <figure className="bw-post-video">
          <video controls playsInline preload="metadata" autoPlay={autoplay} muted={immersive} loop={immersive}
            src={postMediaUrl(video.id)}
            aria-label={video.name} />
          <figcaption>{video.name} · {humanBytes(video.size)}</figcaption>
        </figure>
      )}
      {document && <DocumentCarousel key={document.id} item={document} />}
    </div>
  );
}

export function PostMediaPreview({ media }) {
  if (!media?.length) return null;
  return (
    <ul className="bw-post-media-preview" aria-label="Selected attachments">
      {media.map(file => <li key={file.id}>
        <span className="bw-post-media-preview-type">{file.kind === "DOCUMENT" ? "PDF" : file.kind === "IMAGE" ? "IMG" : "VIDEO"}</span>
        <span title={file.name}>{file.name}</span>
        <small>{file.kind === "DOCUMENT" ? (file.pageCount || 1) + " pages" : humanBytes(file.size)}</small>
      </li>)}
    </ul>
  );
}

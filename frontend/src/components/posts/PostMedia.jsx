import { useRef, useState } from "react";
import { postMediaUrl } from "../../api/organization-posts";
import NavigationIcon from "../layout/NavigationIcon";
import PostPhotoGallery from "./PostPhotoGallery";

const humanBytes = size => size >= 1024 * 1024
  ? (size / (1024 * 1024)).toFixed(1) + " MB"
  : Math.max(1, Math.ceil(size / 1024)) + " KB";

function DocumentCard({ item }) {
  const total = Math.max(1, Number(item.pageCount) || 1);
  const [page, setPage] = useState(1);
  const swipe = useRef(null);
  const url = postMediaUrl(item.id);
  function nextPage(delta) {
    setPage(value => Math.max(1, Math.min(total, value + delta)));
  }
  return (
    <section className="bw-post-document" aria-label={"PDF document " + item.name}>
      <header className="bw-post-document-header">
        <span className="bw-post-document-icon" aria-hidden="true">PDF</span>
        <span className="bw-post-document-name" title={item.name}>{item.name}</span>
        <span className="bw-post-document-info">{total} {total === 1 ? "page" : "pages"}</span>
      </header>
      <div className="bw-post-document-viewport" role="group"
        aria-label={"Document pages for " + item.name} tabIndex={0}
        onKeyDown={event => {
          if (event.key === "ArrowLeft") { event.preventDefault(); nextPage(-1); }
          if (event.key === "ArrowRight") { event.preventDefault(); nextPage(1); }
        }}>
        <iframe
          title={item.name + " page " + page + " of " + total}
          src={url + "#page=" + page + "&toolbar=0&navpanes=0&view=FitH"}
          loading="lazy" referrerPolicy="no-referrer"
          className="bw-post-document-frame"
        />
        <div className="bw-post-document-swipe" aria-hidden="true"
          onTouchStart={event => { swipe.current = event.changedTouches[0]?.clientX ?? null; }}
          onTouchEnd={event => {
            const end = event.changedTouches[0]?.clientX;
            if (swipe.current != null && end != null && Math.abs(end - swipe.current) > 45) {
              nextPage(end < swipe.current ? 1 : -1);
            }
            swipe.current = null;
          }} />
        {page > 1 && <button type="button" className="bw-post-document-overlay-prev"
          aria-label="Previous PDF page" onClick={() => nextPage(-1)}>
          <NavigationIcon name="chevron-left" size={20} />
        </button>}
        {page < total && <button type="button" className="bw-post-document-overlay-next"
          aria-label="Next PDF page" onClick={() => nextPage(1)}>
          <NavigationIcon name="chevron-right" size={20} />
        </button>}
      </div>
      <footer className="bw-post-document-footer">
        <div className="bw-post-document-pages">
          <button type="button" disabled={page <= 1} aria-label="Previous document page"
            onClick={() => nextPage(-1)}><NavigationIcon name="chevron-left" size={17} /></button>
          <span aria-live="polite">Page {page} of {total}</span>
          <button type="button" disabled={page >= total} aria-label="Next document page"
            onClick={() => nextPage(1)}><NavigationIcon name="chevron-right" size={17} /></button>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          aria-label={"Open PDF " + item.name + " in a new tab"}>
          Open PDF <NavigationIcon name="share" size={15} />
        </a>
      </footer>
      <p className="bw-post-document-accessibility">Swipe or use the arrows to change pages. Your browser may open the document directly if embedded PDF viewing is unavailable.</p>
    </section>
  );
}

export default function PostMedia({ media }) {
  if (!Array.isArray(media) || !media.length) return null;
  const images = media.filter(file => file.kind === "IMAGE");
  const video = media.find(file => file.kind === "VIDEO");
  const document = media.find(file => file.kind === "DOCUMENT");
  return (
    <div className="bw-post-media" aria-label="Post attachments">
      {images.length > 0 && <PostPhotoGallery images={images} />}
      {video && (
        <figure className="bw-post-video">
          <video controls playsInline preload="metadata" src={postMediaUrl(video.id)}
            aria-label={video.name} />
          <figcaption>{video.name} · {humanBytes(video.size)}</figcaption>
        </figure>
      )}
      {document && <DocumentCard item={document} />}
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

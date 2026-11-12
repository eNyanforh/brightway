import { useState } from "react";
import { postMediaUrl } from "../../api/organization-posts";

const mediaSize = value => value < 1024 * 1024
  ? Math.ceil(value / 1024) + " KB" : (value / 1024 / 1024).toFixed(1) + " MB";

function DocumentPreview({ media }) {
  const [page, setPage] = useState(1);
  const total = Math.max(1, Number(media.pages) || 1);
  const url = postMediaUrl(media.id);
  return (
    <section className="bw-post-document" aria-label={"PDF document: " + media.name}>
      <header className="bw-post-document-header">
        <span className="bw-post-document-mark" aria-hidden="true">PDF</span>
        <div>
          <strong title={media.name}>{media.name}</strong>
          <span>{total} {total === 1 ? "page" : "pages"} · {mediaSize(media.size)}</span>
        </div>
      </header>
      <div className="bw-post-document-viewport">
        <iframe
          key={page} loading="lazy" title={"Page " + page + " of " + media.name}
          src={url + "#page=" + page + "&toolbar=0&navpanes=0"}
          sandbox="allow-scripts allow-downloads"
          referrerPolicy="no-referrer"
        />
      </div>
      <footer className="bw-post-document-footer">
        <div className="bw-post-document-pagination" role="group" aria-label="Document page navigation">
          <button type="button" aria-label="Previous document page" disabled={page <= 1}
            onClick={() => setPage(current => Math.max(1, current - 1))}>‹</button>
          <span>Page {page} / {total}</span>
          <button type="button" aria-label="Next document page" disabled={page >= total}
            onClick={() => setPage(current => Math.min(total, current + 1))}>›</button>
        </div>
        <div className="bw-post-document-links">
          <a href={url} target="_blank" rel="noopener noreferrer">Open</a>
          <a href={postMediaUrl(media.id, true)} download={media.name}>Download</a>
        </div>
      </footer>
    </section>
  );
}

export default function PostMediaGallery({ media = [] }) {
  if (!media.length) return null;
  const images = media.filter(item => item.kind === "IMAGE");
  const others = media.filter(item => item.kind !== "IMAGE");
  return (
    <div className="bw-post-media-gallery" aria-label="Post attachments">
      {images.length > 0 && (
        <div className={"bw-post-image-grid bw-post-image-grid--" + Math.min(4, images.length)}
          aria-label="Post photos">
          {images.map(image => (
            <a key={image.id} href={postMediaUrl(image.id)} target="_blank"
              rel="noopener noreferrer" className="bw-post-image-link"
              aria-label={"Open image " + image.name}>
              <img src={postMediaUrl(image.id)} alt={image.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {others.map(item => item.kind === "VIDEO"
        ? <figure className="bw-post-video" key={item.id}>
            <video controls playsInline preload="metadata" src={postMediaUrl(item.id)}
              aria-label={item.name} />
            <figcaption>{item.name}</figcaption>
          </figure>
        : item.kind === "PDF" ? <DocumentPreview key={item.id} media={item} /> : null)}
    </div>
  );
}

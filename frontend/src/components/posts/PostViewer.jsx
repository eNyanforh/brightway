import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import NavigationIcon from "../layout/NavigationIcon";
import "./post-viewer.css";

const keyOf = item => (item.organization ? "organization" : "member") + ":" + item.id;

export default function PostViewer({ posts = [], post, loading = false, onClose, onNavigate, renderPost }) {
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const touch = useRef(null);
  const ordered = useMemo(() => [...new Map(posts.filter(item => item?.id).map(item => [keyOf(item), item])).values()], [posts]);
  const index = post ? ordered.findIndex(item => keyOf(item) === keyOf(post)) : -1;
  const hasPrevious = index > 0;
  const hasNext = index >= 0 && index < ordered.length - 1;

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.querySelectorAll(".bw-post-panel video").forEach(video => video.pause());
    document.body.style.overflow = "hidden";
    element.showModal();
    closeButton.current?.focus();
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function select(direction) {
    const next = ordered[index + direction];
    if (next) onNavigate(next);
  }

  function keys(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
      || event.target.closest("input,textarea,select,[contenteditable='true'],.bw-document-carousel,.bw-question-answers,.bw-post-comments-section"))
      return;
    if (event.key === "ArrowDown" && hasNext) { event.preventDefault(); select(1); }
    if (event.key === "ArrowUp" && hasPrevious) { event.preventDefault(); select(-1); }
  }

  function startTouch(event) {
    if (event.touches.length !== 1 || event.target.closest("button,a,input,textarea,select,.bw-document-carousel,.bw-post-comments-section,.bw-question-answers")) {
      touch.current = null; return;
    }
    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function endTouch(event) {
    const start = touch.current;
    touch.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dy) < 65 || Math.abs(dy) < Math.abs(dx) * 1.35) return;
    if (dy < 0 && hasNext) select(1);
    else if (dy > 0 && hasPrevious) select(-1);
  }

  return createPortal(
    <dialog ref={dialog} className="bw-post-viewer" aria-label="Post viewer"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={keys}>
      <div className="bw-post-viewer-heading">
        <span className="bw-post-viewer-counter" aria-live="polite">
          {index >= 0 ? (index + 1) + " / " + ordered.length : "Post viewer"}
        </span>
        <button ref={closeButton} type="button" className="bw-post-viewer-close"
          aria-label="Close post viewer" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <section className="bw-post-viewer-slide" aria-label="Current post"
        onTouchStart={startTouch} onTouchEnd={endTouch} onTouchCancel={() => { touch.current = null; }}>
        {post ? renderPost(post) : (
          <div className="bw-post-viewer-unavailable" role="status">
            <strong>{loading ? "Opening post…" : "This post is unavailable"}</strong>
            {!loading && <p>It may have been removed or you may no longer have access.</p>}
          </div>
        )}
      </section>
      <nav className="bw-post-viewer-navigation" aria-label="Browse posts">
        <button type="button" aria-label="Previous post" title="Previous post"
          disabled={!hasPrevious} onClick={() => select(-1)}>
          <NavigationIcon name="chevron-left" size={24} />
        </button>
        <button type="button" aria-label="Next post" title="Next post"
          disabled={!hasNext} onClick={() => select(1)}>
          <NavigationIcon name="chevron-right" size={24} />
        </button>
      </nav>
      <span className="bw-post-viewer-hint" aria-hidden="true">Swipe up for next post</span>
    </dialog>,
    document.body,
  );
}

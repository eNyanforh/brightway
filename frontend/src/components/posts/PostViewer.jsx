import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import NavigationIcon from "../layout/NavigationIcon";
import "./post-viewer.css";

const keyOf = item => (item.organization ? "organization" : "member") + ":" + item.id;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const gestureControls = "a,input,textarea,select,video,[contenteditable='true'],.bw-document-carousel,.bw-post-comments-section,.bw-question-answers,.bw-immersive-post-bottom";

export default function PostViewer({ posts = [], post, loading = false, onClose, onNavigate, renderPost }) {
  const dialog = useRef(null);
  const slide = useRef(null);
  const closeButton = useRef(null);
  const touch = useRef(null);
  const motion = useRef(null);
  const navigating = useRef(false);
  const direction = useRef(1);
  const ordered = useMemo(() => [...new Map(posts.filter(item => item?.id).map(item => [keyOf(item), item])).values()], [posts]);
  const selectedKey = post ? keyOf(post) : null;
  const index = post ? ordered.findIndex(item => keyOf(item) === selectedKey) : -1;
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
      motion.current?.cancel();
      if (element.open) element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const element = slide.current;
    navigating.current = false;
    element.style.transform = "";
    if (reducedMotion() || !element.animate) return;
    motion.current?.cancel();
    motion.current = element.animate([
      { opacity: .4, transform: `translateY(${direction.current * 32}px)` },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [selectedKey]);

  const select = useCallback(async step => {
    const next = ordered[index + step];
    if (!next || navigating.current) return;
    navigating.current = true;
    direction.current = step;
    const element = slide.current;
    if (!reducedMotion() && element?.animate) {
      motion.current?.cancel();
      motion.current = element.animate([
        { opacity: 1, transform: element.style.transform || "translateY(0)" },
        { opacity: .4, transform: `translateY(${-step * 32}px)` },
      ], { duration: 110, easing: "ease-in", fill: "forwards" });
      try { await motion.current.finished; } catch { return; }
    }
    if (dialog.current?.open) onNavigate(next);
  }, [ordered, index, onNavigate]);

  useEffect(() => {
    const handleKey = event => {
      if (!dialog.current?.open || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const nestedDialog = target?.closest("dialog");
      if (nestedDialog && nestedDialog !== dialog.current) return;
      if (target?.closest(gestureControls + ",[role='dialog'],[role='menu']")) return;
      const step = event.key === "ArrowDown" && hasNext ? 1
        : event.key === "ArrowUp" && hasPrevious ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      void select(step);
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [hasPrevious, hasNext, select]);

  function startTouch(event) {
    const button = event.target.closest("button");
    if (event.touches.length !== 1 || navigating.current || event.target.closest(gestureControls)
      || (button && !button.matches(".bw-photo-gallery-open"))) {
      touch.current = null; return;
    }
    motion.current?.cancel();
    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function moveTouch(event) {
    if (event.touches.length !== 1) { resetTouch(); return; }
    const start = touch.current;
    if (!start || reducedMotion()) return;
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx) * 1.35) return;
    slide.current.style.transform = `translateY(${Math.max(-90, Math.min(90, dy * .35))}px)`;
  }

  function resetTouch() {
    touch.current = null;
    const element = slide.current;
    if (!element) return;
    const transform = element.style.transform;
    element.style.transform = "";
    if (transform && !reducedMotion() && element.animate) {
      motion.current = element.animate([{ transform }, { transform: "translateY(0)" }],
        { duration: 180, easing: "ease-out" });
    }
  }

  function endTouch(event) {
    const start = touch.current;
    touch.current = null;
    if (!start || event.changedTouches.length !== 1) { resetTouch(); return; }
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dy) < 65 || Math.abs(dy) < Math.abs(dx) * 1.35) { resetTouch(); return; }
    if (dy < 0 && hasNext) void select(1);
    else if (dy > 0 && hasPrevious) void select(-1);
    else resetTouch();
  }

  return createPortal(
    <dialog ref={dialog} className="bw-post-viewer" aria-label="Post viewer"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <header className="bw-post-viewer-heading">
        <strong>Post</strong>
        <span className="bw-post-viewer-counter" aria-live="polite" aria-atomic="true">
          {index >= 0 ? (index + 1) + " / " + ordered.length : "Post viewer"}
        </span>
        <button ref={closeButton} type="button" className="bw-post-viewer-close"
          aria-label="Close post viewer" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <section ref={slide} className="bw-post-viewer-slide" aria-label="Current post"
        onTouchStart={startTouch} onTouchMove={moveTouch} onTouchEnd={endTouch} onTouchCancel={resetTouch}>
        {post ? renderPost(post) : (
          <div className="bw-post-viewer-unavailable" role="status">
            <strong>{loading ? "Opening post…" : "This post is unavailable"}</strong>
            {!loading && <p>It may have been removed or you may no longer have access.</p>}
          </div>
        )}
      </section>
      <nav className="bw-post-viewer-navigation" aria-label="Browse posts">
        <span className="bw-post-viewer-hint" aria-hidden="true">Swipe up or use the arrows</span>
        <button type="button" aria-label="Previous post" title="Previous post"
          disabled={!hasPrevious} onClick={() => void select(-1)}>
          <NavigationIcon name="chevron-left" size={20} />
        </button>
        <button type="button" aria-label="Next post" title="Next post"
          disabled={!hasNext} onClick={() => void select(1)}>
          <NavigationIcon name="chevron-right" size={20} />
        </button>
      </nav>
    </dialog>, document.body,
  );
}

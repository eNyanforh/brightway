import { useRef, useState } from "react";
import { postMediaUrl } from "../../api/organization-posts";
import NavigationIcon from "../layout/NavigationIcon";
import "./post-photo-stage.css";

function SelectedPhoto({ image, onSwipe, position }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const touch = useRef(null);
  const viewport = useRef(null);

  function toggleZoom() {
    if (!loaded || failed) return;
    setZoomed(value => !value);
    viewport.current?.scrollTo?.(0, 0);
  }

  function finishSwipe(event) {
    const start = touch.current;
    touch.current = null;
    const end = event.changedTouches[0];
    if (!start || !end || zoomed || event.changedTouches.length !== 1) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  }

  return (
    <>
      <div className="bw-post-photo-viewport" ref={viewport} data-zoomed={zoomed}
        onTouchStart={event => {
          const point = event.touches[0];
          touch.current = event.touches.length === 1 && !zoomed ? { x: point.clientX, y: point.clientY } : null;
        }}
        onTouchMove={event => { if (event.touches.length !== 1) touch.current = null; }}
        onTouchEnd={finishSwipe} onTouchCancel={() => { touch.current = null; }}>
        {failed ? <div className="bw-post-photo-status" role="status">
          <NavigationIcon name="image" size={30} />
          <span>This photo couldn’t load.</span>
          <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
        </div> : <>
          {!loaded && <span className="bw-post-photo-status" role="status">Loading photo…</span>}
          <img key={attempt} src={postMediaUrl(image.id)} alt={image.name || "Post photo " + position}
            draggable={false} onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
            onDoubleClick={toggleZoom} />
        </>}
      </div>
      {loaded && !failed && <button type="button" className="bw-post-photo-zoom"
        aria-label={zoomed ? "Zoom out" : "Zoom in"} aria-pressed={zoomed} onClick={toggleZoom}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="10" cy="10" r="6.5" /><path d="m15 15 6 6M7 10h6" />{!zoomed && <path d="M10 7v6" />}
        </svg>
      </button>}
    </>
  );
}

/** The published post owns the dialog and URL. Only its selected photograph changes here. */
export default function PostPhotoStage({ images, index = 0, onSelect }) {
  const current = index >= 0 && index < images.length ? index : 0;
  const image = images[current];
  if (!image) return null;

  function move(step) {
    const next = current + step;
    if (next >= 0 && next < images.length) onSelect(next);
  }

  return (
    <div className="bw-post-photo-stage" role="group" aria-label="Photos in this post">
      <SelectedPhoto key={image.id} image={image} position={current + 1} onSwipe={move} />
      {images.length > 1 && <>
        <button type="button" className="bw-post-photo-prev" aria-label="Previous photo"
          disabled={current === 0} onClick={() => move(-1)}><NavigationIcon name="chevron-left" size={24} /></button>
        <button type="button" className="bw-post-photo-next" aria-label="Next photo"
          disabled={current === images.length - 1} onClick={() => move(1)}><NavigationIcon name="chevron-right" size={24} /></button>
        <span className="bw-post-photo-position" aria-live="polite" aria-atomic="true">
          {current + 1} of {images.length}
        </span>
      </>}
    </div>
  );
}

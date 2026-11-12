import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { postMediaUrl } from "../../api/organization-posts";
import NavigationIcon from "../layout/NavigationIcon";
import { photoLayout } from "./photo-layout";
import "./post-photo-gallery.css";

function Photo({ file, onLoaded, eager = false }) {
  const [status, setStatus] = useState("loading");
  return (
    <span className="bw-gallery-photo" data-status={status}>
      <img src={postMediaUrl(file.id)} alt={file.name} loading={eager ? "eager" : "lazy"}
        decoding="async" draggable={false}
        onLoad={event => {
          setStatus("ready");
          onLoaded?.(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight);
        }} onError={() => { setStatus("error"); onLoaded?.(1); }} />
      {status === "loading" && <span className="bw-gallery-placeholder" aria-hidden="true"><NavigationIcon name="image" size={28} /></span>}
      {status === "error" && <span className="bw-gallery-placeholder bw-gallery-unavailable"><NavigationIcon name="image" size={28} /><span>Photo unavailable</span></span>}
    </span>
  );
}

function PhotoViewer({ images, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const viewport = useRef(null);
  const touch = useRef(null);
  const file = images[index];

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    closeButton.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function select(next) {
    if (next < 0 || next >= images.length || next === index) return;
    setIndex(next);
    setZoomed(false);
    setFailed(false);
    setLoaded(false);
    setRetry(0);
    if (viewport.current) viewport.current.scrollTo?.(0, 0);
  }

  function toggleZoom() {
    setZoomed(value => !value);
    if (viewport.current) viewport.current.scrollTo?.(0, 0);
  }

  return createPortal(
    <dialog ref={dialog} className="bw-photo-viewer" aria-label="Photo viewer"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={event => {
        // Keep enclosing composer focus/escape handlers out of the topmost modal.
        event.stopPropagation();
        if (event.key === "Tab") {
          const controls = [...dialog.current.querySelectorAll('button:not([disabled]), a[href]')];
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === "ArrowRight" && !zoomed) { event.preventDefault(); event.stopPropagation(); select(index + 1); }
        if (event.key === "ArrowLeft" && !zoomed) { event.preventDefault(); event.stopPropagation(); select(index - 1); }
      }}>
      <header className="bw-photo-viewer-header">
        <div className="bw-photo-viewer-heading"><strong>Photos</strong><span aria-live="polite" aria-atomic="true">{index + 1} of {images.length}</span></div>
        <div className="bw-photo-viewer-tools">
          <button type="button" aria-label={zoomed ? "Zoom out" : "Zoom in"} aria-pressed={zoomed}
            disabled={!loaded || failed} onClick={toggleZoom}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="m15 15 6 6M7 10h6" />{!zoomed && <path d="M10 7v6" />}</svg>
          </button>
          <a href={postMediaUrl(file.id)} target="_blank" rel="noopener noreferrer" aria-label="Open original photo in a new tab" title="Open original">
            <NavigationIcon name="share" size={21} />
          </a>
          <button type="button" ref={closeButton} aria-label="Close photo viewer" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>
      <div className="bw-photo-viewer-stage">
        <div ref={viewport} className="bw-photo-viewer-viewport" data-zoomed={zoomed}
          onTouchStart={event => {
            touch.current = event.touches.length === 1 && !zoomed
              ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
          }}
          onTouchMove={event => { if (event.touches.length !== 1) touch.current = null; }}
          onTouchCancel={() => { touch.current = null; }}
          onTouchEnd={event => {
            const start = touch.current;
            const end = event.changedTouches[0];
            touch.current = null;
            if (!start || !end || zoomed) return;
            const dx = end.clientX - start.x;
            const dy = end.clientY - start.y;
            if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) select(index + (dx < 0 ? 1 : -1));
          }}>
          {!loaded && !failed && <span className="bw-photo-viewer-loading" role="status">Loading photo…</span>}
          {failed ? <div className="bw-photo-viewer-error" role="status">
            <NavigationIcon name="image" size={40} /><strong>This photo couldn’t load</strong>
            <p>Check your connection and try again.</p>
            <button type="button" onClick={() => { setFailed(false); setLoaded(false); setRetry(value => value + 1); }}>Try again</button>
          </div> : <img key={file.id + ":" + retry} src={postMediaUrl(file.id)} alt={file.name}
            className="bw-photo-viewer-image" data-loaded={loaded} draggable={false}
            onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
            onDoubleClick={() => { if (loaded) toggleZoom(); }} />}
        </div>
        {images.length > 1 && <>
          <button className="bw-photo-viewer-prev" type="button" aria-label="Previous photo" disabled={index === 0} onClick={() => select(index - 1)}><NavigationIcon name="chevron-left" size={27} /></button>
          <button className="bw-photo-viewer-next" type="button" aria-label="Next photo" disabled={index === images.length - 1} onClick={() => select(index + 1)}><NavigationIcon name="chevron-right" size={27} /></button>
        </>}
      </div>
      <footer className="bw-photo-viewer-footer">
        {images.length > 1 && <div className="bw-photo-viewer-thumbnails" role="group" aria-label="Choose a photo">
          {images.map((image, position) => <button type="button" key={image.id}
            aria-label={"View photo " + (position + 1)} aria-pressed={position === index}
            onClick={() => select(position)}><img src={postMediaUrl(image.id)} alt="" draggable={false} /></button>)}
        </div>}
        <p title={file.name}>{file.name}</p>
      </footer>
    </dialog>, document.body,
  );
}

export default function PostPhotoGallery({ images, onRemove, disabled = false }) {
  const [viewing, setViewing] = useState(null);
  const [measurements, setMeasurements] = useState({});
  if (!images.length) return null;
  // Wait for the whole set before choosing the collage so later images do not
  // repeatedly change the layout as they load. Failed photos use a square slot.
  const ready = images.every(file => measurements[file.id] > 0);
  const { layout, aspect, lead } = photoLayout(images.map(file => ready ? measurements[file.id] : 1));
  const styles = { aspectRatio: aspect,
    ...(lead ? { "--bw-gallery-lead": lead + "fr", "--bw-gallery-rest": (1 - lead) + "fr" } : {}),
  };
  return (
    <>
      <div className="bw-photo-gallery" data-count={images.length} data-layout={layout}
        style={styles}
        role="group" aria-label={onRemove ? "Selected photos" : "Post photos"}>
        {images.map((file, index) => <div className="bw-photo-gallery-tile" key={file.id}>
          <button type="button" className="bw-photo-gallery-open"
            aria-label={"Open photo " + (index + 1) + " of " + images.length + ": " + file.name}
            onClick={() => setViewing(index)}>
            <Photo file={file} onLoaded={value => setMeasurements(current => current[file.id] === value
              ? current : { ...current, [file.id]: value })} />
            <span className="bw-photo-gallery-expand" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" /></svg></span>
          </button>
          {onRemove && <button className="bw-photo-gallery-remove" type="button" disabled={disabled}
            aria-label={"Remove attachment " + file.name} onClick={() => onRemove(file)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>}
        </div>)}
      </div>
      {viewing !== null && <PhotoViewer images={images} initialIndex={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

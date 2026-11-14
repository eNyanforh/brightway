import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { postMediaUrl } from "../../api/organization-posts";
import NavigationIcon from "../layout/NavigationIcon";
import { openPdfDocument } from "./pdf-document";
import "./document-carousel.css";

function ExpandIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>;
}
function DownloadIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>;
}

function DocumentPage({ pdf, number, active, render }) {
  const holder = useRef(null);
  const [status, setStatus] = useState("loading");
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!render) return undefined;
    const element = holder.current;
    let disposed = false;
    let task;
    let generation = 0;
    async function paint() {
      const current = ++generation;
      task?.cancel();
      setStatus("loading");
      try {
        const page = await pdf.getPage(number);
        if (disposed || current !== generation) return;
        const original = page.getViewport({ scale: 1 });
        const width = Math.max(1, element.clientWidth || 600);
        const height = Math.max(1, element.clientHeight || 800);
        const fit = Math.min(width / original.width, height / original.height);
        const density = Math.min(window.devicePixelRatio || 1, 2,
          Math.sqrt(4000000 / (original.width * original.height * fit * fit)));
        const viewport = page.getViewport({ scale: fit * density });
        // Each render gets its own canvas; resizing never reuses a busy canvas.
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.width = Math.floor(original.width * fit) + "px";
        canvas.style.height = Math.floor(original.height * fit) + "px";
        task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
        await task.promise;
        if (disposed || current !== generation) return;
        element.replaceChildren(canvas);
        setStatus("ready");
        const content = await page.getTextContent();
        if (!disposed && current === generation) setText(content.items.map(item => item.str || "").join(" ").slice(0, 20000));
      } catch (error) {
        if (!disposed && current === generation && error?.name !== "RenderingCancelledException") setStatus("error");
      }
    }
    void paint();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => void paint()) : null;
    observer?.observe(element);
    return () => { disposed = true; generation++; observer?.disconnect(); task?.cancel(); element.replaceChildren(); };
  }, [pdf, number, render, attempt]);
  return <div className="bw-document-slide" role="group" aria-roledescription="slide"
    aria-label={"Page " + number} aria-hidden={!active}>
    <div className="bw-document-page-canvas" ref={holder} />
    {render && status === "loading" && <span className="bw-document-page-loading" role={active ? "status" : undefined}>Loading page…</span>}
    {render && status === "error" && <div className="bw-document-page-error"><span>This page couldn’t load.</span><button type="button" tabIndex={active ? 0 : -1} onClick={() => setAttempt(value => value + 1)}>Retry page</button></div>}
    {text && <p className="bw-document-sr-only">{text}</p>}
  </div>;
}

export default function DocumentCarousel({ item }) {
  const root = useRef(null);
  const dialog = useRef(null);
  const expandButton = useRef(null);
  const touch = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [nearViewport, setNearViewport] = useState(() => typeof IntersectionObserver === "undefined");
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const url = postMediaUrl(item.id);
  const total = document?.pdf.numPages || Math.max(1, Number(item.pageCount) || 1);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(entries => {
      const nearby = entries.some(entry => entry.isIntersecting);
      setNearViewport(nearby);
      if (nearby) setVisible(true);
    }, { rootMargin: "400px" });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const controller = new AbortController();
    let loaded;
    openPdfDocument(url, controller.signal).then(result => {
      loaded = result;
      if (controller.signal.aborted) { void result.destroy(); return; }
      setDocument(result); setPage(0);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message || "This document couldn’t load."); });
    return () => { controller.abort(); if (loaded) void loaded.destroy(); };
  }, [url, visible, attempt]);

  useEffect(() => {
    if (!expanded) return undefined;
    const modal = dialog.current;
    const overflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    modal.showModal();
    modal.querySelector('[aria-label="Close document viewer"]')?.focus();
    return () => { modal.close(); window.document.body.style.overflow = overflow; };
  }, [expanded]);

  function closeExpanded() {
    setExpanded(false);
    queueMicrotask(() => expandButton.current?.focus({ preventScroll: true }));
  }
  const select = next => setPage(Math.max(0, Math.min(total - 1, next)));
  function keys(event) {
    if (event.key === "ArrowRight") { event.preventDefault(); select(page + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); select(page - 1); }
    if (event.key === "Home") { event.preventDefault(); select(0); }
    if (event.key === "End") { event.preventDefault(); select(total - 1); }
  }
  function deck() {
    return <>
      <div className="bw-document-viewport" role="group" aria-label={"Document pages for " + item.name}
        tabIndex={0} style={{ aspectRatio: document ? Math.max(.65, Math.min(2.4, document.aspect)) : .78 }}
        onTouchStart={event => { touch.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
        onTouchMove={event => { if (event.touches.length !== 1) touch.current = null; }}
        onTouchCancel={() => { touch.current = null; }}
        onTouchEnd={event => {
          const start = touch.current; const end = event.changedTouches[0]; touch.current = null;
          if (!start || !end) return;
          const dx = end.clientX - start.x, dy = end.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) select(page + (dx < 0 ? 1 : -1));
        }}>
        {document ? <div className="bw-document-track" style={{ transform: `translateX(-${page * 100}%)` }}>
          {Array.from({ length: total }, (_, index) => <DocumentPage key={index} pdf={document.pdf}
            number={index + 1} active={page === index} render={(expanded || nearViewport) && Math.abs(page - index) <= 1} />)}
        </div> : error ? <div className="bw-document-load-error" role="alert"><strong>Document preview unavailable</strong><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button><a href={url} target="_blank" rel="noopener noreferrer">Open PDF</a></div>
          : <div className="bw-document-loading" role="status">Loading document…</div>}
        {document && total > 1 && <>
          <button type="button" className="bw-document-prev" aria-label="Previous document page" disabled={page === 0} onClick={() => select(page - 1)}><NavigationIcon name="chevron-left" size={26} /></button>
          <button type="button" className="bw-document-next" aria-label="Next document page" disabled={page === total - 1} onClick={() => select(page + 1)}><NavigationIcon name="chevron-right" size={26} /></button>
        </>}
      </div>
      <div className="bw-document-toolbar">
        <span className="bw-document-counter" aria-live="polite" aria-atomic="true" aria-label={"Page " + (page + 1) + " of " + total}>{page + 1} / {total}</span>
        <input type="range" min={1} max={total} value={page + 1} disabled={!document || total < 2}
          aria-label="Document page" aria-valuetext={"Page " + (page + 1) + " of " + total} onChange={event => select(Number(event.target.value) - 1)} />
        {document && <a href={document.downloadUrl} download={item.name} aria-label="Download document" title="Download"><DownloadIcon /></a>}
        {!expanded && <button ref={expandButton} type="button" aria-label="Expand document" title="Expand" disabled={!document} onClick={() => setExpanded(true)}><ExpandIcon /></button>}
      </div>
    </>;
  }
  return <section ref={root} className="bw-document-carousel" aria-label={"PDF document " + item.name} onKeyDown={keys}>
    {expanded ? <div className="bw-document-inline-placeholder" style={{ aspectRatio: Math.max(.65, Math.min(2.4, document?.aspect || .78)) }} /> : deck()}
    <div className="bw-document-caption"><strong title={item.name}>{item.name.replace(/\.pdf$/i, "")}</strong><span>{total} {total === 1 ? "page" : "pages"} · PDF</span></div>
    {expanded && createPortal(<dialog ref={dialog} className="bw-document-dialog" aria-label={"Document viewer " + item.name}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); closeExpanded(); }}
      onKeyDown={event => {
        event.stopPropagation(); keys(event);
        if (event.key === "Escape") { event.preventDefault(); closeExpanded(); }
        if (event.key === "Tab") {
          const targets = [...dialog.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')];
          if (!event.shiftKey && window.document.activeElement === targets.at(-1)) { event.preventDefault(); targets[0]?.focus(); }
          if (event.shiftKey && window.document.activeElement === targets[0]) { event.preventDefault(); targets.at(-1)?.focus(); }
        }
      }}>
      <header><strong>{item.name}</strong><button type="button" aria-label="Close document viewer" onClick={closeExpanded}>×</button></header>
      <div className="bw-document-expanded-deck">{deck()}</div>
    </dialog>, window.document.body)}
  </section>;
}

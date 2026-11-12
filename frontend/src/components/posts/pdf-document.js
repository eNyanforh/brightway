import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
let library;

export async function openPdfDocument(url, signal) {
  library ??= import("pdfjs-dist").then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  const [pdfjs, response] = await Promise.all([
    library, fetch(url, { credentials: "include", cache: "no-store", signal }),
  ]);
  if (!response.ok) throw Error("This document is unavailable. Try again or download the PDF.");
  if (Number(response.headers.get("content-length")) > 5 * 1024 * 1024) throw Error("This document is too large to preview.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (bytes.length > 5 * 1024 * 1024) throw Error("This document is too large to preview.");
  const downloadUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const resources = new URL(import.meta.env.BASE_URL + "pdfjs/", window.location.origin).href;
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false,
    cMapUrl: resources + "cmaps/", cMapPacked: true,
    standardFontDataUrl: resources + "standard_fonts/", wasmUrl: resources + "wasm/",
  });
  let destruction;
  function destroy() {
    if (!destruction) {
      signal.removeEventListener("abort", abort);
      URL.revokeObjectURL(downloadUrl);
      destruction = task.destroy();
    }
    return destruction;
  }
  const abort = () => { void destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (pdf.numPages < 1 || pdf.numPages > 100) throw Error("Use a document with 1 to 100 pages.");
    const first = await pdf.getPage(1);
    const viewport = first.getViewport({ scale: 1 });
    return { pdf, downloadUrl, aspect: viewport.width / viewport.height,
      destroy };
  } catch (error) {
    void destroy();
    throw error;
  }
}

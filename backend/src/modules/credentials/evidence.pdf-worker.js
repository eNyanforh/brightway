import { parentPort, workerData } from "node:worker_threads";
import { PDFDocument, PDFName, PDFDict, PDFArray } from "pdf-lib";
try {
  const document = await PDFDocument.load(workerData, { ignoreEncryption: false, updateMetadata: false });
  if (document.getPageCount() < 1 || document.getPageCount() > 100) throw new Error("pages");
  // Supporting documents must be static: reject actions, scripts, forms and embedded files.
  const blocked = new Set(["JS", "JavaScript", "OpenAction", "AA", "AcroForm", "EmbeddedFiles", "RichMedia", "Launch", "XFA"]);
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const queue = [object instanceof PDFDict || object instanceof PDFArray ? object : object.dict];
    let visited = 0;
    while (queue.length) {
      if (++visited > 100000) throw new Error("complexity");
      const value = queue.pop();
      if (value instanceof PDFDict) {
        for (const [key, child] of value.entries()) {
          if (blocked.has(key.decodeText()) || (key === PDFName.of("S") && child === PDFName.of("JavaScript"))) throw new Error("active content");
          if (child instanceof PDFDict || child instanceof PDFArray) queue.push(child);
        }
      } else if (value instanceof PDFArray) {
        for (const child of value.asArray()) if (child instanceof PDFDict || child instanceof PDFArray) queue.push(child);
      }
    }
  }
  parentPort.postMessage(true);
} catch { parentPort.postMessage(false); }

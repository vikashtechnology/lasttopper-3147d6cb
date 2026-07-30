import { jsPDF } from "jspdf";

async function loadImage(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed"));
    img.src = dataUrl;
  });
}

/** Export one or more handwritten page images into a single A4 PDF. */
export async function downloadHandwrittenPdf(urls: string[], fileName = "topper-ai-notes.pdf") {
  if (!urls.length) return;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 24;

  for (let i = 0; i < urls.length; i++) {
    const img = await loadImage(urls[i]);
    const maxW = pw - margin * 2;
    const maxH = ph - margin * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    if (i > 0) doc.addPage();
    doc.addImage(img.src, "PNG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
  }

  doc.save(fileName);
}

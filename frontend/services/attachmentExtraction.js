const MAX_EXTRACTED_CHARS = 6000;

function truncateText(value, maxChars = MAX_EXTRACTED_CHARS) {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function extractFromImage(file) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return truncateText(normalizeWhitespace(data?.text || ""));
  } finally {
    await worker.terminate();
  }
}

async function extractFromPdf(file) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const chunks = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ");
    const clean = normalizeWhitespace(text);
    if (clean) chunks.push(clean);
    if (chunks.join("\n").length > MAX_EXTRACTED_CHARS) break;
  }

  return truncateText(chunks.join("\n"));
}

async function extractFromPlainFile(file) {
  const text = await file.text();
  return truncateText(normalizeWhitespace(text));
}

export async function extractTextFromFile(file) {
  const mimeType = String(file?.type || "").toLowerCase();
  const fileName = String(file?.name || "").toLowerCase();

  if (!file) {
    return { text: "", status: "error", error: "No file selected." };
  }

  try {
    if (mimeType.startsWith("image/")) {
      const text = await extractFromImage(file);
      if (!text) {
        return { text: "", status: "warning", error: "No readable text found in image." };
      }
      return { text, status: "ready", error: "" };
    }

    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      const text = await extractFromPdf(file);
      if (!text) {
        return { text: "", status: "warning", error: "No readable text found in PDF." };
      }
      return { text, status: "ready", error: "" };
    }

    const textLikeMime = mimeType.startsWith("text/") || mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("csv");
    const textLikeFile = /\.(txt|md|json|csv|xml|log)$/i.test(fileName);
    if (textLikeMime || textLikeFile) {
      const text = await extractFromPlainFile(file);
      if (!text) {
        return { text: "", status: "warning", error: "File is readable but contains no extractable text." };
      }
      return { text, status: "ready", error: "" };
    }

    return {
      text: "",
      status: "warning",
      error: "Unsupported file type for text extraction. Supported: images, PDF, text/JSON/CSV/XML.",
    };
  } catch (error) {
    return {
      text: "",
      status: "error",
      error: `Extraction failed: ${error?.message || "unknown error"}`,
    };
  }
}

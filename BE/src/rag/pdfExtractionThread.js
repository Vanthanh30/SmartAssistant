import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
let task;
try {
  const bytes = workerData.bytes
    ? Buffer.from(workerData.bytes)
    : await readFile(workerData.path);
  if (createHash("sha256").update(bytes).digest("hex") !== workerData.sha256)
    throw new Error("PDF_INTEGRITY_FAILED");
  const pdfRoot = dirname(
    fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")),
  );
  task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: `${pdfRoot}/standard_fonts/`,
    cMapUrl: `${pdfRoot}/cmaps/`,
    cMapPacked: true,
    stopAtErrors: true,
    verbosity: 0,
  });
  const pdf = await task.promise;
  if (pdf.numPages > workerData.maxPages) throw new Error("PDF_TOO_MANY_PAGES");
  const pages = [];
  let chars = 0;
  let usableChars = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    // Preserve extracted text and EOL. Normalization/chunking belongs to Sprint05.
    const text = content.items
      .filter((item) => typeof item.str === "string")
      .map((item) => item.str + (item.hasEOL ? "\n" : " "))
      .join("");
    chars += text.length;
    usableChars += (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
    if (chars > workerData.maxChars) throw new Error("PDF_TOO_MUCH_TEXT");
    pages.push({ pageNumber, text });
    page.cleanup();
  }
  if (!usableChars) throw new Error("PDF_NO_TEXT");
  parentPort.postMessage({
    ok: true,
    result: {
      schemaVersion: 1,
      sourceSha256: workerData.sha256,
      extractor: "pdfjs-dist",
      extractorVersion: "6.4.299",
      pageCount: pdf.numPages,
      pages,
    },
  });
} catch (error) {
  const known = [
    "PDF_INTEGRITY_FAILED",
    "PDF_TOO_MANY_PAGES",
    "PDF_TOO_MUCH_TEXT",
    "PDF_NO_TEXT",
  ];
  const code = known.includes(error.message)
    ? error.message
    : error.name === "PasswordException"
      ? "PDF_PASSWORD_PROTECTED"
      : error.code === "ENOENT"
        ? "PDF_FILE_MISSING"
        : ["EIO", "EBUSY", "EMFILE", "EACCES", "ENFILE"].includes(error.code)
          ? "PDF_STORAGE_UNAVAILABLE"
          : "PDF_INVALID";
  parentPort.postMessage({ ok: false, code });
} finally {
  await task?.destroy();
}

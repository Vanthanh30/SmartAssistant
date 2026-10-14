import { Worker } from "node:worker_threads";
export function startPdfExtraction(path, document, config) {
  const worker = new Worker(
    new URL("./pdfExtractionThread.js", import.meta.url),
    {
      workerData: {
        ...(Buffer.isBuffer(path) ? { bytes: path } : { path }),
        sha256: document.sha256,
        maxPages: config.PDF_MAX_PAGES,
        maxChars: config.PDF_MAX_TEXT_CHARS,
      },
      resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 },
    },
  );
  let settled = false;
  let timeout;
  const promise = new Promise((resolve, reject) => {
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolve(result);
    };
    worker.on("message", (message) => {
      if (message.ok) finish(null, message.result);
      else
        finish(Object.assign(new Error(message.code), { code: message.code }));
    });
    worker.on("error", () =>
      finish(
        Object.assign(new Error("PDF_TOO_COMPLEX"), {
          code: "PDF_TOO_COMPLEX",
        }),
      ),
    );
    worker.on("exit", () => {
      if (!settled)
        finish(
          Object.assign(new Error("EXTRACTION_INTERRUPTED"), {
            code: "EXTRACTION_INTERRUPTED",
          }),
        );
    });
    timeout = setTimeout(() => {
      finish(
        Object.assign(new Error("PDF_EXTRACTION_TIMEOUT"), {
          code: "PDF_EXTRACTION_TIMEOUT",
        }),
      );
      void worker.terminate();
    }, config.PDF_EXTRACTION_TIMEOUT_MS);
  });
  return { promise, cancel: () => worker.terminate() };
}

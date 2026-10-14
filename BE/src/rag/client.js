export function ragClient(config) {
  return async (path, body, signal) => {
    const response = await fetch(config.RAG_SERVICE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": config.RAG_SERVICE_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([
        AbortSignal.timeout(config.RAG_TIMEOUT_MS),
        ...(signal ? [signal] : []),
      ]),
    });
    if (!response.ok)
      throw Object.assign(new Error("RAG_REQUEST_FAILED"), {
        code: response.status === 422 ? "RAG_INVALID_INPUT" : "RAG_UNAVAILABLE",
      });
    return response.json();
  };
}

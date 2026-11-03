export function ragClient(config) {
  return async (path, body, signal) => {
    let response;
    try {
      response = await fetch(config.RAG_SERVICE_URL + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Token": config.RAG_SERVICE_TOKEN },
        body: JSON.stringify(body),
        signal: AbortSignal.any([AbortSignal.timeout(config.RAG_TIMEOUT_MS), ...(signal ? [signal] : [])]),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw Object.assign(new Error("RAG_REQUEST_FAILED"), {
        code: error.name === 'TimeoutError' ? 'RAG_TIMEOUT' : 'RAG_CONNECTION_FAILED',
      });
    }
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw Object.assign(new Error("RAG_REQUEST_FAILED"), {
      code: response.status === 422 ? "RAG_INVALID_INPUT"
        : response.status === 404 ? 'RAG_ENDPOINT_UNAVAILABLE'
        : response.status === 401 || response.status === 403 ? "RAG_UNAUTHORIZED"
        : response.status === 503 && failure.error === 'RAG_MEMORY_LIMIT' ? 'RAG_MEMORY_LIMIT' : "RAG_UNAVAILABLE",
      });
    }
    let result;
    try { result = await response.json(); }
    catch (error) {
      if (signal?.aborted) throw error;
      throw Object.assign(new Error("RAG_REQUEST_FAILED"), { code: error.name === 'TimeoutError' ? 'RAG_TIMEOUT' : 'RAG_INVALID_RESPONSE' });
    }
    if (path === '/indexes/search' && (!result || typeof result.version !== 'string' || !Array.isArray(result.candidates)
      || result.candidates.some(item => !item || typeof item.chunkId !== 'string' || !Number.isFinite(item.score)))) {
      throw Object.assign(new Error("RAG_REQUEST_FAILED"), { code: 'RAG_INVALID_RESPONSE' });
    }
    if (path === '/indexes/search-batch' && (!result || typeof result.version !== 'string' || !Array.isArray(result.rankings)
      || result.rankings.length !== body.queries.length || result.rankings.some(ranking => !Array.isArray(ranking)
        || ranking.some(item => !item || typeof item.chunkId !== 'string' || !Number.isFinite(item.score))))) {
      throw Object.assign(new Error('RAG_REQUEST_FAILED'), { code: 'RAG_INVALID_RESPONSE' });
    }
    return result;
  };
}

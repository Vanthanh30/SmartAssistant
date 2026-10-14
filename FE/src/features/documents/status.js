export const isProcessing = document => ['queued','extracting','chunking','embedding','indexing'].includes(document.status) || (document.status === 'deleting' && !document.deletionRetryable);
export function pollInterval(query) {
  if (query.state.error) return false;
  const data = query.state.data;
  const active = Array.isArray(data?.data) ? data.data.some(isProcessing) : data && isProcessing(data);
  return active ? Math.min(15000, 2000 * 2 ** Math.min(3, Math.floor(query.state.dataUpdateCount / 4))) : false;
}

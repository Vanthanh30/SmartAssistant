// null follows all ready documents, including ones uploaded later; [] means none.
export const isDocumentSelected = (ids, document) => document.status === 'ready' &&
  (ids === null || ids.includes(document.id));

export function toggleDocumentSelection(ids, readyIds, id, checked) {
  const selected = new Set(ids === null ? readyIds : ids);
  if (checked) selected.add(id);
  else selected.delete(id);
  return [...selected];
}

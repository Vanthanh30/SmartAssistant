export function practiceDestination(courseId, setId, search = '') {
  const params = new URLSearchParams(search);
  params.set('view', 'study');
  params.set('studySet', setId);
  params.delete('studyAttempt');
  params.delete('attempt');
  return `/app/courses/${encodeURIComponent(courseId)}?${params}`;
}

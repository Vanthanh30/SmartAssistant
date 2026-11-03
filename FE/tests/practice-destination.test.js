import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceDestination } from '../src/features/chat/practiceDestination.js';
test('opens generated or reused set in course study tab without stale attempts', () => {
  const url = new URL(practiceDestination('26', '101', '?conversation=30&view=chat&studyAttempt=99&attempt=98&studySet=10'), 'http://localhost');
  assert.equal(url.pathname, '/app/courses/26');
  assert.equal(url.searchParams.get('view'), 'study');
  assert.equal(url.searchParams.get('studySet'), '101');
  assert.equal(url.searchParams.get('conversation'), '30');
  assert.equal(url.searchParams.has('studyAttempt'), false);
  assert.equal(url.searchParams.has('attempt'), false);
});

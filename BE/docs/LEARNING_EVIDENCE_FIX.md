# Quiz and flashcard evidence

The former generation contract asked Gemini to copy both chunk IDs and quotations.
Live verification reproduced a five-question quiz failing exact-quotation checks,
including after one bounded output repair. API configuration was no longer the issue.

Generation now selects opaque passage IDs from a request-local catalogue. The
backend materializes their exact original source text and chunk IDs before checking
answers or saving anything. No new database fields or API response fields are added.

The catalogue is bounded to 64 passages and 12,800 source characters, sampled in
round-robin order across selected chunks. Short headings retain the following
paragraph where it fits. It is a bounded source selection, not a guarantee that a
small quiz tests every detail of the document. Passages exceeding 600 characters
are omitted rather than silently rewritten.

Per-kind schemas enforce four choices and an integer answer index for quizzes;
flashcards have empty choices and a null index. Unknown passage IDs, invalid item
structures and fabricated quotes are rejected. Completed invalid output can be
regenerated once using the same sources. Network/quota failures are not repaired.
Independent correctness verification remains mandatory; a negative verdict never
publishes a set. Existing item/citation persistence receives the same original quote
and chunk ID structure it used previously.

2026-10-28 validation:

- Automated tests cover both kinds, passage-ID bounds, bounded repair, rejection
  after repeated invalid output, and negative correctness verification.
- Live readonly API replay on the current 17-page PDF in course 25:
  five quiz questions passed in 4,627 ms; five flashcards passed in 3,519 ms.
  Every evidence quote matched original text; no test sets or other DB writes.
- Restart the existing backend terminal and create a new request to load the fix.

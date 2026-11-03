# Unified PDF learning generation

The UI now has a single generation flow. The internal `generationMode` remains
`ai`, matching the existing SQL enum; no tables, columns or libraries were added.

Rules extract explicit facts and propose source-linked question drafts. Gemini
refines those drafts and creates other questions from the bounded source catalogue.
The backend resolves evidence IDs to original PDF passages, validates structure,
and independently verifies the entire set against the catalogue. Normal generation
uses two generation operations (plus their token-count requests). One repair is
allowed: either structural repair or semantic repair of only the failed indices,
followed by re-verification. Invalid results are never published. This does not
guarantee that a small set covers every detail or that new generation uses fewer
tokens than every older workflow; reuse is the main quota saving.

Verified sets record pipeline revision, source/config fingerprint and verification
state in the existing `cau_hinh_tao` JSON field. New requests with matching source
text, positions, document versions, title, kind, count and model can reopen that
set without API calls. Old sets without this verification marker are not reused.
`forceNew=true` explicitly requests another generated set. A MySQL advisory lock
prevents simultaneous matching generation; source/actor checks run again before
returning cached results or saving generated ones. Source mutation aborts saving.

The existing request ID still protects creation retries; cache reuse returns the
ID of the previously stored set. No user data or test sets were changed by live
validation.

Validation on 2026-10-28:

- 100 automated tests passed, including reuse, forced regeneration, invalidation,
  locking, exact evidence and repair of only failed cards.
- Live API replay on the current PDF in course 25: five quiz questions verified
  in 6,014 ms and five flashcards in 13,044 ms; all quotes matched original source,
  zero database writes.
- Lint/format and FE build checked. Restart BE and refresh FE to activate.

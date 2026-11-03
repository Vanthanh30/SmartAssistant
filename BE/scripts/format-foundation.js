import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep review scope explicit: format only the foundation and business modules refactored so far.
const scope = [
  'src/app.js',
  'src/modules/**/controller.js',
  'src/modules/**/routes.js',
  'src/modules/shared/studentRouter.js',
  'src/middlewares/{requestId,bodyParser,noStore,errorHandler,validate,rateLimit,upload}.js',
  'src/modules/documents/{parseRange,pdfController}.js',
  'src/modules/admin/service.js',
  'src/modules/shared/{idSchema,recovery,recoveryRepository}.js',
  'src/modules/auth/{service,repository,sessionRepository,mapper}.js',
  'src/modules/admin/{repository,auditRepository,auditTail,mapper}.js',
  'src/modules/documents/{service,sourceService,formulaService,repository,mapper,requestSchema}.js',
  'src/modules/conversations/{service,aiService,repository,sourceRepository,mapper,requestSchema}.js',
  'src/modules/learning/{service,aiService,repository,mapper,requestSchema}.js',
  'src/modules/learning/reuse.js',
  'src/modules/studyCalendar/{service,sessionRepository,sessionMapper,requestSchema}.js',
  'src/modules/studyCalendar/google/{service,eventMapper}.js',
  'src/modules/conversations/provider.js',
  'src/modules/conversations/{answerCoverage,citationSnapshot,followup,queryTerms}.js',
  'src/modules/conversations/questionUnderstanding.js',
  'src/modules/conversations/formulaVisualAnswer.js',
  'src/modules/conversations/{summaryIntent,summaryService}.js',
  'src/modules/documents/{summaryRepository,summaryService,summaryResilience}.js',
  'src/rag/{pdfLayout,pdfExtractionThread,formulaCrop,formulaCropThread,sourceLimitations}.js',
  'src/modules/conversations/sourceMedia.js',
  'src/modules/conversations/{countAnswer,localAnswer,topicEvidence}.js',
  'tests/rag/**/*.js',
  'tests/llm/**/*.js',
  'scripts/evaluate-grounding.js',
  'scripts/inspect-pdf-layout.js',
  'scripts/verify-summary-live.js',
  'src/integrations/{llm,google}/*.js',
  'tests/modules/**/*.js',
  'tests/contracts/**/*.js',
  'tests/contracts/fixtures/*.json',
  'scripts/format-foundation.js',
  'scripts/benchmark-backend.js',
  'scripts/smoke-readonly.js',
  'eslint.config.js',
  '.prettierrc.json',
  'package.json',
];
const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) throw new Error('Use --write or --check');
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url)),
    mode,
    '--no-error-on-unmatched-pattern',
    ...scope,
  ],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

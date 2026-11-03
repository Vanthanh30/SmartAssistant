import { readFile, appendFile } from 'node:fs/promises';
import webpush from 'web-push';
const file = new URL('../.env', import.meta.url);
const current = await readFile(file, 'utf8');
if (/^WEB_PUSH_(PUBLIC|PRIVATE)_KEY=.+/m.test(current)) {
  console.log('Web Push keys already exist; kept unchanged.');
} else {
  const keys = webpush.generateVAPIDKeys();
  await appendFile(
    file,
    `\nWEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_SUBJECT=mailto:notifications@studyassistant.local\n`,
  );
  console.log(
    'Web Push keys saved privately to BE/.env. Restart existing API/worker to load them.',
  );
}

import { resolveStreamUrl } from './stream.js';
const ids = (process.argv[2] || 'kJQP7kiw5Fk,zfWlGsiFDzk,81017UEYhRk').split(',');
for (const id of ids) {
  const start = Date.now();
  const full = await resolveStreamUrl(id.trim());
  const fullMs = Date.now() - start;
  console.log('ID:', id, '| ok:', full.ok, '| provider:', full.provider, '| title:', full.title, '| ms:', fullMs);
  if (full.url) console.log('  URL:', full.url.slice(0, 90));
  console.log('---');
}

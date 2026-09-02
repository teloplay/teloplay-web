import { resolveStreamUrl, tryDirectResolver } from './stream.js';
const ids = (process.argv[2] || '81017UEYhRk').split(',');
for (const id of ids) {
  const start = Date.now();
  // 1) direct multi-client
  const direct = await tryDirectResolver(id);
  const directMs = Date.now() - start;
  console.log('ID', id, 'direct.ok=', direct.ok, 'ms=', directMs);
  if (direct.attempts) {
    for (const a of direct.attempts) {
      console.log('  -', a.client, 'ok=', a.ok, 'ms=', a.ms, 'reason=', a.reason || '');
    }
  }
  // 2) full resolve with converter fallback
  const full = await resolveStreamUrl(id);
  const fullMs = Date.now() - start;
  console.log('ID', id, 'resolve.ok=', full.ok, 'provider=', full.provider, 'title=', full.title, 'ms=', fullMs);
  console.log('---');
}

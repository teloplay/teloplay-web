import https from 'https';

function get(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, text: b }); }
      });
    }).on('error', e => resolve({ error: e.message }));
  });
}

const scClientId = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';

async function searchAndStream(query) {
  const t0 = Date.now();
  const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${scClientId}&limit=5`;
  const sRes = await get(searchUrl);
  const tracks = sRes.json?.collection || [];
  if (!tracks.length) {
    console.log(`[FAIL] No tracks found for: "${query}" in ${Date.now() - t0}ms`);
    return null;
  }

  // Find best match (prefer full track over 30s preview)
  for (const t of tracks) {
    const trans = t.media?.transcodings || [];
    // Full progressive streams (not preview)
    const fullProg = trans.find(tr => tr.format?.protocol === 'progressive' && !tr.url.includes('/preview/'));
    const prog = fullProg || trans.find(tr => tr.format?.protocol === 'progressive') || trans[0];

    if (prog?.url) {
      const streamRes = await get(`${prog.url}?client_id=${scClientId}`);
      if (streamRes.json?.url) {
        const isPreview = streamRes.json.url.includes('/preview/');
        console.log(`[OK] "${query}" in ${Date.now() - t0}ms:`);
        console.log(`     Found: "${t.title}" by ${t.user?.username} (Duration: ${Math.round((t.duration||0)/1000)}s, isPreview: ${isPreview})`);
        console.log(`     Stream URL: ${streamRes.json.url.slice(0, 60)}...`);
        return { ok: true, url: streamRes.json.url, isPreview, title: t.title, author: t.user?.username, duration: Math.round((t.duration||0)/1000) };
      }
    }
  }
  return null;
}

async function testList() {
  const songs = [
    'Safar Bayaan',
    'Safar Jab Harry Met Sejal Pritam',
    'Safar Jass Mallah',
    'Sohena Jatona Arfin Rumey',
    'Kesariya Arijit Singh',
    'Despacito Luis Fonsi',
    'Alan Walker Faded',
    'Bayaan Sherazam Safar'
  ];

  for (const s of songs) {
    await searchAndStream(s);
  }
}

testList();

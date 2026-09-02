import https from 'https';

function fetchJson(url, opts = {}) {
  return new Promise(resolve => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...(opts.headers || {})
      },
      timeout: 5000
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b), headers: res.headers }); }
        catch (e) { resolve({ status: res.statusCode, text: b, headers: res.headers }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function testFastAPIs() {
  const songId = 'Dr50xWMk39Y';
  console.log('Testing fast providers for:', songId);

  // Let's test yt-dlp web API instances, Cobalt instances, Rapid / Vevioz / Y2down / Yt5s
  const apis = [
    // 1. Cobalt instances
    { name: 'cobalt-canine', url: 'https://cobalt-backend.canine.tools', method: 'POST', body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${songId}`, downloadMode: 'audio' }) },
    { name: 'cobalt-hyper', url: 'https://cobalt-api.hyper.lol', method: 'POST', body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${songId}`, downloadMode: 'audio' }) },
    { name: 'cobalt-tools', url: 'https://api.cobalt.tools', method: 'POST', body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${songId}`, downloadMode: 'audio' }) },

    // 2. Invidious instances
    { name: 'invidious-yewtu', url: `https://yewtu.be/api/v1/videos/${songId}` },
    { name: 'invidious-flokinet', url: `https://invidious.flokinet.to/api/v1/videos/${songId}` },
    { name: 'invidious-projectsegfault', url: `https://invidious.projectsegfau.lt/api/v1/videos/${songId}` },
    { name: 'invidious-drgns', url: `https://invidious.drgns.space/api/v1/videos/${songId}` },

    // 3. Piped instances
    { name: 'piped-kavin', url: `https://pipedapi.kavin.rocks/streams/${songId}` },
    { name: 'piped-privatecoffee', url: `https://api.piped.private.coffee/streams/${songId}` },
    { name: 'piped-lunar', url: `https://piped-api.lunar.icu/streams/${songId}` },

    // 4. ezmp3 / yttomp3 / yt1s
    { name: 'ezmp3', url: `https://api.ezmp3.cc/api/convert?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + songId)}` }
  ];

  for (const api of apis) {
    const t0 = Date.now();
    const res = await fetchJson(api.url, { method: api.method || 'GET', body: api.body });
    const ms = Date.now() - t0;
    console.log(`[${api.name}] (${ms}ms) -> status: ${res.status}, hasData: ${!!res.data}, err: ${res.error || ''}`);
    if (res.data?.url || res.data?.audioStreams || res.data?.adaptiveFormats) {
      console.log('   FOUND STREAM DATA!', res.data.url || res.data.audioStreams?.[0]?.url?.slice(0, 60));
    }
  }
}

testFastAPIs();

import https from 'https';

function fetchJson(url, opts = {}) {
  return new Promise(resolve => {
    const isHttps = url.startsWith('https:');
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
      timeout: opts.timeout || 8000
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b), headers: res.headers }); }
        catch (e) { resolve({ status: res.statusCode, text: b, headers: res.headers }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function testFastYTStreams() {
  const videoId = 'Dr50xWMk39Y';
  console.log('Testing fast stream extractors for:', videoId);

  // 1. YouTube oEmbed / watch page parsing / Android Testsuite
  const configs = [
    // Piped working instances from uptimerobot / public list
    `https://piped.video/api/v1/streams/${videoId}`,
    `https://cf.pipedapi.kavin.rocks/streams/${videoId}`,
    `https://pa.il.ax/streams/${videoId}`,

    // Youtubedl / Cobalt public instances
    `https://cobalt.tools/api/json`,
    `https://api.cobalt.tools/api/json`,
    
    // Invidious API
    `https://inv.riverside.rocks/api/v1/videos/${videoId}`,
    `https://invidious.io.lol/api/v1/videos/${videoId}`,

    // YT1s
    `https://yt1s.com/api/ajaxSearch/index`,

    // Y2Mate
    `https://www.y2mate.com/mates/analyzeV2/ajax`,

    // SaveTube / Ymp4 / Y2down
    `https://api.savetube.me/info/${videoId}`,
    `https://api.vevioz.com/api/button/mp3/${videoId}`,
    `https://downloader.freemake.com/api/video/${videoId}`
  ];

  for (const c of configs) {
    const t0 = Date.now();
    const res = await fetchJson(c);
    console.log(`[${new URL(c).hostname}] (${Date.now() - t0}ms) -> status: ${res.status}, hasData: ${!!res.data}, err: ${res.error || ''}`);
  }
}

testFastYTStreams();

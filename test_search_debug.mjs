import https from 'https';

function post(url, body) {
  return new Promise(resolve => {
    const postData = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.write(postData);
    req.end();
  });
}

function findItems(obj, key, res = []) {
  if (!obj || typeof obj !== 'object') return res;
  if (Array.isArray(obj)) { for (const i of obj) findItems(i, key, res); return res; }
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) res.push(v); else findItems(v, key, res);
  }
  return res;
}

async function inspectSearchSafar() {
  const body = {
    context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20260114.01.00', gl: 'US', hl: 'en' } },
    query: 'safar'
  };

  const json = await post('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', body);
  const renderers = findItems(json, 'musicResponsiveListItemRenderer');
  console.log('Found renderers:', renderers.length);

  for (let i = 0; i < Math.min(6, renderers.length); i++) {
    const r = renderers[i];
    console.log(`\n--- Item ${i + 1} ---`);
    console.log('playlistItemData:', r.playlistItemData);
    console.log('thumbnail:', JSON.stringify(r.thumbnail));
    console.log('flexColumns count:', r.flexColumns?.length);
    for (let c = 0; c < (r.flexColumns || []).length; c++) {
      const col = r.flexColumns[c]?.musicResponsiveListItemFlexColumnRenderer;
      console.log(`  col[${c}]:`, col?.text?.runs?.map(run => ({ text: run.text, endpoint: !!run.navigationEndpoint })));
    }
  }
}

inspectSearchSafar();

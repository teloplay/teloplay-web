/**
 * JioSaavn fallback resolver (direct api.php + DES decrypt, no third party).
 * Used when YouTube direct resolve is IP-blocked and the mp3 converter is
 * down. Returns 320kbps MP3s for mainstream (esp. Indian) catalog.
 */

import forge from 'node-forge';

const SAAVN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DES_KEY = '38346591';

// Self-contained liveness probe (no imports from stream.js).
async function probeAlive(url, timeoutMs = 8000) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET', signal: ctl.signal,
      headers: { 'User-Agent': SAAVN_UA, Range: 'bytes=0-1023' },
    });
    clearTimeout(to);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    try { res.body?.cancel(); } catch {}
    return res.status === 206 || (res.status === 200 && ct.startsWith('audio/'));
  } catch {
    return false;
  }
}

function decryptMediaUrl(enc) {
  const clean = String(enc || '').replace(/\s/g, '');
  if (!clean) return null;
  try {
    const decipher = forge.cipher.createDecipher('DES-ECB', forge.util.createBuffer(DES_KEY, 'utf8'));
    decipher.start({ iv: '' });
    decipher.update(forge.util.createBuffer(forge.util.decode64(clean)));
    decipher.finish();
    const out = decipher.output.toString().replace(/\0+$/, '').trim();
    // Saavn preview/decrypt output sometimes carries trailing junk after .mp4
    const m = out.match(/(https?:\/\/[^\s'"]+?\.mp4[^\s'"]*)/);
    return m ? m[1] : (out.startsWith('http') ? out : null);
  } catch {
    return null;
  }
}

async function saavnGet(path, timeoutMs = 10000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://www.jiosaavn.com/api.php${path}`, {
      signal: ctl.signal,
      headers: { 'User-Agent': SAAVN_UA, Accept: 'application/json' },
    });
    clearTimeout(to);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(to);
    return null;
  }
}

export async function trySaavnResolver(title, artist, durationSec = 0) {
  try {
    const q = encodeURIComponent(`${title || ''} ${artist || ''}`.trim());
    if (!q) return { ok: false, reason: 'empty-query' };
    const search = await saavnGet(
      `?__call=search.getResults&api_version=4&_format=json&_marker=0&ctx=web6dot0&p=1&n=5&q=${q}`,
    );
    const results = search?.results || [];
    // Prefer duration match (±15s) when we know the YT duration, else first.
    let picked = results[0] || null;
    if (durationSec > 0) {
      const close = results.find((r) => {
        const d = Number(r?.duration || r?.more_info?.duration || 0);
        return d > 0 && Math.abs(d - durationSec) <= 15;
      });
      if (close) picked = close;
    }
    // Search results already carry more_info.encrypted_media_url —
    // no separate getDetails call needed.
    const mi = picked?.more_info || {};
    const enc = mi.encrypted_media_url;
    const sid = picked?.id || null;
    if (!enc) return { ok: false, reason: 'no-enc-url' };
    let url = decryptMediaUrl(enc);
    if (!url) return { ok: false, reason: 'decrypt-fail' };
    // Upgrade preview/96k to 320k when the pattern allows it.
    if (url.includes('_96.mp4')) url = url.replace('_96.mp4', '_320.mp4');
    else if (url.includes('_48.mp4')) url = url.replace('_48.mp4', '_320.mp4');
    const v = await probeAlive(url);
    if (!v) return { ok: false, reason: 'dead-link' };
    return {
      ok: true,
      provider: 'saavn_320',
      url,
      mimeType: 'audio/mp4',
      title: picked?.title || title,
      author: artist,
      saavnId: sid,
    };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 60) };
  }
}

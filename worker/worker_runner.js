import http from 'http';
import worker from './worker.js';

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }

  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = req;
  }

  const workerRequest = new Request(url, {
    method: req.method,
    headers: headers,
    body: body,
    duplex: 'half'
  });

  try {
    const workerResponse = await worker.fetch(workerRequest, {}, {});
    
    res.statusCode = workerResponse.status;
    for (const [k, v] of workerResponse.headers.entries()) {
      res.setHeader(k, v);
    }

    if (workerResponse.body) {
      try {
        const reader = workerResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (res.writableEnded || res.destroyed) {
            await reader.cancel();
            break;
          }
          const ok = res.write(value);
          if (!ok) {
            await new Promise((r) => res.once('drain', r));
          }
        }
      } catch (streamErr) {
        // Normal client abort/seek disconnect
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
    } else {
      res.end();
    }
  } catch (e) {
    console.error('[Worker Runner Error]', e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
  }
});

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('  TeloPlay Bot-Proof Stream API Server');
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log('='.repeat(50));
});


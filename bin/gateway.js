const http = require('http');

const POSTGREST_PORT = 54320;
const GATEWAY_PORT = 54321;

const server = http.createServer((req, res) => {
  // Strip /rest/v1 if present for PostgREST routing
  let targetPath = req.url;
  if (targetPath.startsWith('/rest/v1')) {
    targetPath = targetPath.slice('/rest/v1'.length) || '/';
  }

  const options = {
    hostname: '127.0.0.1',
    port: POSTGREST_PORT,
    path: targetPath,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Supabase Gateway] Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PostgREST gateway connection failure', message: err.message }));
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(GATEWAY_PORT, '127.0.0.1', () => {
  console.log(`[Supabase Gateway] Listening on http://127.0.0.1:${GATEWAY_PORT} -> PostgREST :${POSTGREST_PORT}`);
});

// Local stand-in for the UAT VirtualServer routes, so Playwright can drive the deployed pods without the WAF:
//   /xrules/*      → xrules-web-svc (port-forward :4501)
//   /xrules-api/*  → xrules-api-svc (port-forward :4400), prefix stripped
// Start the forwards first:
//   kubectl -n budget-bb port-forward svc/xrules-web-svc 4501:3000
//   kubectl -n budget-bb port-forward svc/xrules-api-svc 4400:4000
import http from 'node:http';
const PORT = Number(process.env.PROXY_PORT || 4580);
http.createServer((req, res) => {
  const api = req.url.startsWith('/xrules-api/');
  const target = { host: '127.0.0.1', port: api ? Number(process.env.API_PORT || 4400) : Number(process.env.WEB_PORT || 4501), path: api ? req.url.slice('/xrules-api'.length) : req.url };
  const p = http.request({ ...target, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${target.port}` } }, r => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on('error', e => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
}).listen(PORT, () => console.log(`uat proxy on http://localhost:${PORT}/xrules/`));

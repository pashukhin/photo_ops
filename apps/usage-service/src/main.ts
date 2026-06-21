import { createServer } from 'node:http';

createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok', service: 'usage-service' }));
    return;
  }
  res.statusCode = 501;
  res.end(JSON.stringify({ code: 'not_implemented', message: 'usage accounting is not implemented in this frame' }));
}).listen(3013);

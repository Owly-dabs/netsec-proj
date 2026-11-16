import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDetection } from './detector.mjs';
const outcomes=new Map();
const files = Object.fromEntries([
 ['/', 'index.html', 'text/html'],
 ...['app.js','log-focus.js','attack-controller.js','plant.js','visual-response.js','routing.js','equipment.js','vendor/three.module.js','vendor/three.core.js','vendor/OrbitControls.js'].map(f=>['/'+f,f,'text/javascript']),
 ['/style.css','style.css','text/css']
].map(([url,file,type])=>[url,[file,type]]));
export const server = createServer(async (req, res) => {
  const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  if (req.url === '/api/attacks' && req.method === 'POST') {
    let body = '';
    try {
      for await (const chunk of req) { body += chunk; if (body.length > 1048576) { reply(413, { error: 'Request too large' }); return; } }
      const result = createDetection(JSON.parse(body),undefined,outcomes);
      await new Promise(resolve => setTimeout(resolve, result.delayMs));
      if (!res.destroyed) reply(200, result);
    } catch (error) { reply(400, { error: error instanceof RangeError ? error.message : 'Invalid request' }); }
    return;
  }
  if (req.url?.startsWith('/api/')) { reply(404, { error: 'Not found' }); return; }
  const file = files[req.url];
  if (!file || !['GET', 'HEAD'].includes(req.method)) { reply(404, { error: 'Not found' }); return; }
  try { const data = await readFile(new URL(`./public/${file[0]}`, import.meta.url)); res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : data); }
  catch { reply(500, { error: 'Run npm run build first' }); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`SWaT simulation: http://localhost:${server.address().port}`));

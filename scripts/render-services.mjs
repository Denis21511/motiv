// Рендер картинок для карточек услуг из 3D-модели окна.
// npm run render:services → открыть http://127.0.0.1:5199/ в Chrome/Edge и дождаться «готово».
// PNG сохраняются в assets/img/services/ и assets/img/compare/, дальше их можно пережать в WebP.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'scripts', 'render-services');
const DIRS = ['services', 'compare'];
for (const d of DIRS) mkdirSync(join(root, 'assets', 'img', d), { recursive: true });

const { outputFiles } = await build({
  entryPoints: [join(dir, 'shots.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  write: false,
});
const bundle = outputFiles[0].text;
const page = readFileSync(join(dir, 'index.html'));

const PORT = 5199;
createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/__save') {
    const name = (url.searchParams.get('name') || '').replace(/[^a-z0-9-]/g, '');
    const dir = DIRS.includes(url.searchParams.get('dir')) ? url.searchParams.get('dir') : 'services';
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      writeFileSync(join(root, 'assets', 'img', dir, `${name}.png`), Buffer.from(b64, 'base64'));
      console.log('сохранено:', name);
      res.end('ok');
    });
    return;
  }
  if (url.pathname === '/shots.bundle.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return res.end(bundle);
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(PORT, '127.0.0.1', () => console.log(`Откройте http://127.0.0.1:${PORT}/`));

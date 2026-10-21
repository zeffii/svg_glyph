// Glyphpath local server: serves public/, keeps the project in data/project.json, writes SVG exports to exports/.
// No dependencies. Usage: node serve.mjs   (PORT and HOST env vars override the defaults)
import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root, 'public');
const dataDir = path.join(root, 'data');
const exportDir = path.join(root, 'exports');
const projectFile = path.join(dataDir, 'project.json');
const PORT = Number(process.env.PORT) || 5180;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 20 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, file);
}

async function api(req, res, url) {
  if (url.pathname === '/api/ping') return send(res, 200, 'glyphpath');
  if (url.pathname === '/api/project') {
    if (req.method === 'GET') {
      try { return send(res, 200, await readFile(projectFile, 'utf8'), TYPES['.json']); }
      catch (e) { return e.code === 'ENOENT' ? send(res, 404, 'No project saved yet') : Promise.reject(e); }
    }
    if (req.method === 'PUT') {
      const text = await readBody(req);
      let data;
      try { data = JSON.parse(text); } catch { return send(res, 400, 'Body is not valid JSON'); }
      if (!data?.font?.glyphs?.length) return send(res, 400, 'Project has no glyphs');
      await writeAtomic(projectFile, JSON.stringify(data, null, 1));
      return send(res, 204);
    }
    return send(res, 405, 'Use GET or PUT');
  }
  const m = url.pathname.match(/^\/api\/export\/([^/]+)$/);
  if (m) {
    if (req.method !== 'PUT') return send(res, 405, 'Use PUT');
    const name = decodeURIComponent(m[1]);
    if (!/^[\w.-]+\.svg$/.test(name)) return send(res, 400, 'Export names must look like name.svg');
    await writeAtomic(path.join(exportDir, name), await readBody(req));
    return send(res, 204);
  }
  return send(res, 404, 'Unknown API route');
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(pub, rel));
  if (!file.startsWith(pub + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, 'Not found');
    throw e;
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) send(res, e.status || 500, e.status ? e.message : 'Server error');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, HOST, () => console.log(`Glyphpath running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`));
}

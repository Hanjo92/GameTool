/** Restore only catalog-pinned, hash-verified fonts. Never rewrite provenance. */
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function ensureFont(path, file, fetchFile = fetch) {
  const url = new URL(file.source);
  if (url.origin !== 'https://raw.githubusercontent.com' ||
      !/^\/google\/fonts\/[a-f0-9]{40}\/(ofl|apache|ufl)\/.+\.ttf$/.test(decodeURIComponent(url.pathname)) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Font source must pin an official commit and SHA-256');
  try {
    if (sha256(await readFile(path)) !== file.sha256) throw new Error(`Font hash mismatch: ${path}; preserve and inspect the existing file before retrying`);
    return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetchFile(url.href, { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Font download failed (${response.status}): ${file.file}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== file.sha256) throw new Error(`Downloaded font hash mismatch: ${file.file}`);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, bytes, { flag: 'wx' }); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}
export async function cacheFonts(root = resolve('.')) {
  const base = join(root, 'assets/fonts');
  const catalog = JSON.parse(await readFile(join(base, 'catalog.json'), 'utf8'));
  const tasks = [];
  for (const font of catalog) {
    // Licenses are checked into Git rather than fetched from a mutable branch.
    await readFile(join(base, 'catalog', font.id, font.license));
    for (const file of font.files) tasks.push({ path: join(base, 'catalog', font.id, file.file), file });
  }
  const total = tasks.length;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (tasks.length) { const task = tasks.shift(); await ensureFont(task.path, task.file); }
  }));
  for (const [id, name] of [['noto-sans-kr', 'NotoSansKR.ttf'], ['noto-serif-kr', 'NotoSerifKR.ttf']]) {
    const font = catalog.find(font => font.id === id), file = font.files[0];
    await ensureFont(join(base, name), file, async () => new Response(await readFile(join(base, 'catalog', id, file.file))));
  }
  console.log(`Verified ${total} font files in ${catalog.length} families and 2 Korean fallbacks`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cacheFonts();
}

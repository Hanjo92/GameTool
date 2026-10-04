import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { ensureFont } from '../scripts/cache-fonts.mjs';
const bytes = Buffer.from('font cache fixture');
const file = { file: 'font.ttf', source: `https://raw.githubusercontent.com/google/fonts/${'a'.repeat(40)}/ofl/example/font.ttf`, sha256: createHash('sha256').update(bytes).digest('hex') };
test('font cache restores verified bytes, reuses offline, and preserves mismatched existing files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gametool-font-'));
  try {
    const path = join(dir, 'nested/font.ttf');
    await ensureFont(path, file, async () => new Response(bytes));
    assert.deepEqual(await readFile(path), bytes);
    await ensureFont(path, file, async () => { throw new Error('network must not be used'); });
    await writeFile(path, 'original mismatch');
    await assert.rejects(ensureFont(path, file), /hash mismatch/);
    assert.equal(await readFile(path, 'utf8'), 'original mismatch');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('font cache rejects wrong downloads and unpinned or external sources without saving', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gametool-font-'));
  try {
    const path = join(dir, 'font.ttf');
    await assert.rejects(ensureFont(path, file, async () => new Response('wrong bytes')), /hash mismatch/);
    await assert.rejects(access(path));
    for (const source of [file.source.replace('a'.repeat(40), 'main'), file.source.replace('raw.githubusercontent.com', 'example.com')])
      await assert.rejects(ensureFont(path, { ...file, source }), /official commit/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

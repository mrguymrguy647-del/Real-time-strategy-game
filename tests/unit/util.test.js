import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a32, hash32, hashJson, hashText } from '../../src/util/hash.js';
import { bytesToText, canCompress, gunzip, gzip, isGzip, textToBytes } from '../../src/util/compress.js';
import { cpuBenchmark } from '../../src/util/bench.js';

describe('hash', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    assert.equal(fnv1a32(''), 0x811c9dc5);
    assert.equal(fnv1a32('a'), 0xe40c292c);
    assert.equal(fnv1a32('foobar'), 0xbf9cf968);
  });

  it('gives signed seeds and 16-digit digests', () => {
    assert.equal(hash32('a'), 0xe40c292c | 0);
    assert.match(hashText('hello'), /^[0-9a-f]{16}$/);
    assert.notEqual(hashText('hello'), hashText('hellp'));
    assert.equal(hashJson({ a: 1 }), hashText('{"a":1}'));
  });
});

describe('compress', () => {
  it('is available on this platform', () => {
    assert.equal(canCompress, true);
  });

  it('round-trips text through gzip and recognises gzip data', async () => {
    const original = JSON.stringify({ hello: 'world', list: Array.from({ length: 500 }, (_, i) => i) });
    const bytes = textToBytes(original);
    const packed = await gzip(bytes);
    assert.equal(isGzip(packed), true);
    assert.equal(isGzip(bytes), false);
    assert.ok(packed.length < bytes.length);
    assert.equal(bytesToText(await gunzip(packed)), original);
  });

  it('rejects bytes that are not valid UTF-8 and data that is not gzip', async () => {
    assert.throws(() => bytesToText(new Uint8Array([0xff, 0xfe, 0xfd])));
    await assert.rejects(gunzip(new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5])));
  });
});

describe('bench', () => {
  it('returns a positive number of milliseconds', () => {
    const ms = cpuBenchmark({ rounds: 1 });
    assert.ok(ms > 0 && Number.isFinite(ms));
  });
});

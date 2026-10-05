// gzip helpers built on the platform CompressionStream (Safari 16.4+, all current
// Chromium and Firefox, Node 18+). Callers must check canCompress and fall back to plain bytes.

export const canCompress =
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** @param {string} text */
export function textToBytes(text) {
  return new TextEncoder().encode(text);
}

/** @param {Uint8Array} bytes */
export function bytesToText(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * True when the bytes start with the gzip magic number.
 * @param {Uint8Array} bytes
 */
export function isGzip(bytes) {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * @param {Uint8Array} bytes
 * @param {CompressionStream | DecompressionStream} transform
 */
async function pipe(bytes, transform) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {Uint8Array} bytes */
export function gzip(bytes) {
  return pipe(bytes, new CompressionStream('gzip'));
}

/** @param {Uint8Array} bytes */
export function gunzip(bytes) {
  return pipe(bytes, new DecompressionStream('gzip'));
}

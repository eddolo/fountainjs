import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const gzipBody = promisify(gzip);

function acceptsGzip(header) {
  return header?.split(',').some(entry => {
    const [coding, quality] = entry.toLowerCase().split(';').map(part => part.trim());
    if (coding !== 'gzip') return false;
    if (quality === undefined) return true;
    if (!/^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(quality)) return false;
    return Number(quality.slice(2)) > 0;
  }) ?? false;
}

/** Opt in only for a document-only checkpoint reply with no session credentials. */
export async function writeRetainedCheckpointJson(request, response, json) {
  const raw = Buffer.from(json, 'utf8');
  let body = raw;
  if (raw.length >= 4_096) {
    response.appendHeader('Vary', 'Accept-Encoding');
    if (acceptsGzip(request.headers['accept-encoding'])) {
      const compressed = await gzipBody(raw, { level: 1 });
      if (compressed.length < raw.length) {
        response.setHeader('Content-Encoding', 'gzip');
        body = compressed;
      }
    }
  }
  response.setHeader('Content-Length', body.length);
  response.end(body);
}

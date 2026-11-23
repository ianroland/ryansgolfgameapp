/**
 * Minimal PNG decoder for tests: 8-bit RGBA (colour type 6) or 8-bit palette
 * (colour type 3, with tRNS), non-interlaced. Returns RGBA pixels so tests can
 * check real transparency instead of trusting how an image looks.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface Decoded {
  width: number;
  height: number;
  colorType: number;
  /** RGBA, row-major. */
  data: Uint8Array;
}

export function decodePng(path: string): Decoded {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 3)) throw new Error(`${path}: unsupported PNG (depth ${depth}, type ${colorType})`);
  const bpp = colorType === 6 ? 4 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      const v = raw[src + x];
      let out: number;
      if (f === 0) out = v;
      else if (f === 1) out = v + a;
      else if (f === 2) out = v + b;
      else if (f === 3) out = v + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = out & 255;
    }
  }
  if (colorType === 6) return { width, height, colorType, data: px };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const k = px[i];
    data[i * 4] = palette![k * 3];
    data[i * 4 + 1] = palette![k * 3 + 1];
    data[i * 4 + 2] = palette![k * 3 + 2];
    data[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255;
  }
  return { width, height, colorType, data };
}

export const alphaAt = (img: Decoded, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pub = (f: string) => new URL(`../../public/${f.replace(/^\//, '')}`, import.meta.url);
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

// PNG width and height from the IHDR chunk.
const pngSize = (f: string) => {
  const b = readFileSync(pub(f));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('brand icons', () => {
  it('links every icon the page names, and each file exists', () => {
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/favicon.ico', '/favicon-16x16.png', '/favicon-32x32.png', '/apple-touch-icon.png', '/site.webmanifest']);
    for (const href of hrefs) expect(existsSync(pub(href))).toBe(true);
  });

  it('gives the PWA a 192, a 512 and a maskable 512 that exist at those sizes', () => {
    const manifest = JSON.parse(readFileSync(pub('site.webmanifest'), 'utf8'));
    expect(manifest.start_url).toBe('/');
    const icons: { src: string; sizes: string; purpose: string }[] = manifest.icons;
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of icons) expect(pngSize(icon.src).join('x')).toBe(icon.sizes);
  });

  it('keeps each favicon and the touch icon at the size its link says', () => {
    expect(pngSize('favicon-16x16.png')).toEqual([16, 16]);
    expect(pngSize('favicon-32x32.png')).toEqual([32, 32]);
    expect(pngSize('apple-touch-icon.png')).toEqual([180, 180]);
  });

  it('keeps the 2x Troy avatar at twice the 1x and serves every srcSet file', () => {
    expect(pngSize('troy-96.png')).toEqual([96, 96]);
    expect(pngSize('troy-192.png')).toEqual([192, 192]);
    const src = ['routes/Troy.tsx', 'routes/Auth.tsx', 'routes/ResetPassword.tsx']
      .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
    for (const file of src) {
      const sets = [...file.matchAll(/srcSet="([^"]+)"/g)].map((m) => m[1]);
      expect(sets.length).toBeGreaterThan(0);
      for (const set of sets) for (const part of set.split(',')) expect(existsSync(pub(part.trim().split(/\s+/)[0]))).toBe(true);
    }
  });

  it('names the share card with its version, so platforms fetch the new coin', () => {
    const images = [...html.matchAll(/<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"/g)].map((m) => m[1]);
    expect(images).toEqual(['https://troystack.com/og-image.png?v=2', 'https://troystack.com/og-image.png?v=2']);
    for (const f of ['hooks/usePageMeta.ts', 'lib/structuredData.ts']) {
      expect(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).toContain('/og-image.png?v=2');
    }
  });

  // iOS paints a see-through touch icon black and Android crops the maskable one,
  // so both must stay opaque: no alpha channel and no tRNS chunk.
  it('keeps the touch icon and the maskable icon opaque', () => {
    for (const f of ['apple-touch-icon.png', 'icon-maskable-512.png']) {
      const b = readFileSync(pub(f));
      expect([2, 3]).toContain(b[25]);
      const chunks: string[] = [];
      for (let at = 8; at < b.length; at += 12 + b.readUInt32BE(at)) chunks.push(b.toString('latin1', at + 4, at + 8));
      expect(chunks).toContain('IEND');
      expect(chunks).not.toContain('tRNS');
    }
  });

  it('keeps the big icons light enough to load fast on a phone', () => {
    for (const f of ['icon-512.png', 'icon-maskable-512.png', 'og-image.png']) {
      expect(readFileSync(pub(f)).length).toBeLessThan(200_000);
    }
  });
});

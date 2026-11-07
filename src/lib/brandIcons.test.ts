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
});

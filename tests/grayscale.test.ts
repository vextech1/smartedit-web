import { describe, expect, it } from 'vitest';
import { toGrayscale } from '../src/lib/core/pdf-compress';
import { toolBySlug } from '../src/lib/tools';

describe('toGrayscale', () => {
  it('uses luma weights, keeps alpha, and makes R=G=B', () => {
    const px = Uint8ClampedArray.of(255, 0, 0, 200, 0, 255, 0, 100, 0, 0, 255, 50, 255, 255, 255, 255, 0, 0, 0, 0);
    toGrayscale(px);
    expect(Array.from(px)).toEqual([76, 76, 76, 200, 150, 150, 150, 100, 29, 29, 29, 50, 255, 255, 255, 255, 0, 0, 0, 0]);
  });
  it('leaves already-gray pixels unchanged', () => {
    const px = Uint8Array.of(10, 10, 10, 255, 128, 128, 128, 255); const before = Array.from(px); toGrayscale(px); expect(Array.from(px)).toEqual(before);
  });
  it('ignores a trailing partial pixel and empty input', () => {
    const px = Uint8Array.of(255, 0, 0, 255, 9, 9); toGrayscale(px); expect(Array.from(px)).toEqual([76, 76, 76, 255, 9, 9]); toGrayscale(new Uint8Array(0));
  });
  it('is idempotent', () => {
    const px = Uint8ClampedArray.from({ length: 400 }, (_, i) => (i * 53) & 255); toGrayscale(px); const once = Array.from(px); toGrayscale(px); expect(Array.from(px)).toEqual(once);
  });
});
describe('compress tool text', () => { it('mentions grayscale', () => { expect(toolBySlug('compress-pdf')!.intro).toMatch(/grayscale/); }); });

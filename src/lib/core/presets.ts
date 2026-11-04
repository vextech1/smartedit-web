// Named output sizes for the Resize tool, plus unit conversion. Pure data and maths, no DOM.
export type Unit = 'px' | 'mm' | 'cm' | 'in';
export interface SizePreset {
  id: string; label: string; group: string;
  w: number; h: number; unit: Unit;
  maxKB?: number;       // file-size limit many forms ask for
  minKB?: number;       // and the minimum some of them also ask for
  note?: string;        // a caution shown with the size
  confirm?: boolean;    // official-document sizes: the user must confirm the size before exporting
}

export const GROUPS = ['ID and passport', 'Forms and exams', 'Print sizes', 'Social media'] as const;

const id = (label: string, w: number, h: number, unit: Unit, key: string, note?: string): SizePreset => ({ id: key, label, group: GROUPS[0], w, h, unit, confirm: true, note });
const form = (label: string, w: number, h: number, unit: Unit, key: string, minKB?: number, maxKB?: number, note?: string): SizePreset => ({ id: key, label, group: GROUPS[1], w, h, unit, minKB, maxKB, confirm: true, note });
const print = (label: string, w: number, h: number, unit: Unit, key: string): SizePreset => ({ id: key, label, group: GROUPS[2], w, h, unit });
const social = (label: string, w: number, h: number, key: string): SizePreset => ({ id: key, label, group: GROUPS[3], w, h, unit: 'px' });

export const PRESETS: SizePreset[] = [
  id('US passport and visa', 2, 2, 'in', 'us-passport', 'Printed photos are 2 × 2 in. Online uploads have their own pixel rules.'),
  id('UK passport (printed photo)', 35, 45, 'mm', 'uk-passport', 'For printed photos. Online (digital) UK passport photos follow different rules.'),
  id('Schengen visa', 35, 45, 'mm', 'schengen', 'Most Schengen countries use 35 × 45 mm, but a few ask for something slightly different. Check with the consulate or visa centre.'),
  id('Canada passport', 50, 70, 'mm', 'canada-passport', 'Other Canadian applications can use other sizes. Check the one you are filling in.'),
  id('China visa', 33, 48, 'mm', 'china-visa', 'Visa centres list 33 × 48 mm for paper photos. Online applications may ask for a different digital size.'),
  id('Australia passport', 35, 45, 'mm', 'australia-passport', 'Australia accepts 35 to 40 mm wide and 45 to 50 mm high. This makes the smallest allowed size.'),
  id('Kenya passport (5 × 5 cm)', 5, 5, 'cm', 'kenya-5x5', 'Kenya’s embassy in Bangkok lists 5 × 5 cm. Kenya’s High Commission in Ottawa lists 2 × 2.5 in instead, so check with the mission or the eCitizen page you are using.'),
  id('Kenya passport (2 × 2.5 in)', 2, 2.5, 'in', 'kenya-2x2.5', 'Kenya’s High Commission in Ottawa lists 2.5 × 2 in (taken here as 2 in wide, 2.5 in high). Kenya’s embassy in Bangkok lists 5 × 5 cm instead, so check with the mission or the eCitizen page you are using.'),
  id('Japan passport', 35, 45, 'mm', 'japan-passport', 'Japanese visas and other documents can use different sizes.'),
  id('ID photo 30 × 40 mm', 30, 40, 'mm', 'id-30x40', 'A common size. The office that asked for the photo sets the rule.'),
  id('ID photo 25 × 35 mm', 25, 35, 'mm', 'id-25x35', 'A common size. The office that asked for the photo sets the rule.'),
  id('ID photo 20 × 25 mm (stamp)', 20, 25, 'mm', 'id-20x25', 'A common size. The office that asked for the photo sets the rule.'),
  form('Form photo 200 × 230 px, 20 to 50 KB', 200, 230, 'px', 'form-200x230', 20, 50, 'A common upload size for exam and bank forms. Read your form: some ask for other sizes.'),
  form('Form signature 140 × 60 px, 10 to 20 KB', 140, 60, 'px', 'sign-140x60', 10, 20, 'A common upload size for exam and bank forms. Read your form: some ask for other sizes.'),
  form('Form photo 35 × 45 mm', 35, 45, 'mm', 'form-35x45'),
  print('Wallet 2.5 × 3.5 in', 2.5, 3.5, 'in', 'wallet'),
  print('3.5 × 5 in', 3.5, 5, 'in', 'p-3.5x5'),
  print('4 × 6 in', 4, 6, 'in', 'p-4x6'),
  print('5 × 7 in', 5, 7, 'in', 'p-5x7'),
  print('8 × 10 in', 8, 10, 'in', 'p-8x10'),
  print('A6 (105 × 148 mm)', 105, 148, 'mm', 'a6'),
  print('A5 (148 × 210 mm)', 148, 210, 'mm', 'a5'),
  print('A4 (210 × 297 mm)', 210, 297, 'mm', 'a4'),
  social('Instagram square', 1080, 1080, 'ig-square'),
  social('Instagram portrait', 1080, 1350, 'ig-portrait'),
  social('Story or Reel (9:16)', 1080, 1920, 'story'),
  social('YouTube thumbnail', 1280, 720, 'yt-thumb'),
  social('Profile picture', 500, 500, 'profile'),
  social('LinkedIn banner', 1584, 396, 'li-banner'),
  social('Facebook cover', 820, 312, 'fb-cover'),
  social('X header', 1500, 500, 'x-header')
];

export const presetById = (key: string) => PRESETS.find((p) => p.id === key);

export const MM_PER_IN = 25.4;
const PER_IN: Record<Unit, number> = { px: 0, in: 1, mm: 1 / MM_PER_IN, cm: 1 / 2.54 };

/** A length in `unit` as pixels at `dpi`. Pixels pass through unchanged. Never below 1. */
export function toPx(v: number, unit: Unit, dpi: number): number {
  return Math.max(1, Math.round(unit === 'px' ? v : v * PER_IN[unit] * dpi));
}
/** A length in `unit` as millimetres. Pixels need a dpi to mean anything physical. */
export function toMm(v: number, unit: Unit, dpi: number): number {
  return unit === 'px' ? (v / dpi) * MM_PER_IN : unit === 'mm' ? v : unit === 'cm' ? v * 10 : v * MM_PER_IN;
}
export function sizePx(w: number, h: number, unit: Unit, dpi: number) { return { w: toPx(w, unit, dpi), h: toPx(h, unit, dpi) }; }

const trim = (n: number) => String(Math.round(n * 100) / 100);
export const describeSize = (w: number, h: number, unit: Unit) => `${trim(w)} × ${trim(h)} ${unit}`;

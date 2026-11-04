import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildDocx, xmlEscape } from '../src/lib/core/docx-writer';
import { bodySize, buildLines, pageToBlocks, pdfToDocx, type PageInput, type PdfDocLike, type TextItem } from '../src/lib/core/pdf-docx';
import { toolBySlug } from '../src/lib/tools';

const PNG_1x1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const unzipDoc = (b: Uint8Array) => { const f = unzipSync(b); return { files: f, doc: strFromU8(f['word/document.xml']) }; };

describe('docx writer', () => {
  it('escapes XML and strips illegal control characters', () => {
    expect(xmlEscape('a & b < c > "d" \u0001\u000B')).toBe('a &amp; b &lt; c &gt; &quot;d&quot; ');
  });
  it('writes the required parts, with [Content_Types].xml first', () => {
    const bytes = buildDocx([{ type: 'paragraph', runs: [{ text: 'Hi' }] }], { page: { widthPt: 595, heightPt: 842 } });
    const { files } = unzipDoc(bytes);
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels'])
      expect(files[n], n).toBeTruthy();
    expect(Object.keys(files)[0]).toBe('[Content_Types].xml');
  });
  it('writes headings, bullets, bold/italic, alignment, page breaks and images', () => {
    const bytes = buildDocx([
      { type: 'paragraph', runs: [{ text: 'Title' }], heading: 1, align: 'center' },
      { type: 'paragraph', runs: [{ text: 'bold', bold: true }, { text: ' it', italic: true }], pageBreakBefore: true },
      { type: 'paragraph', runs: [{ text: 'item' }], bullet: true },
      { type: 'image', bytes: PNG_1x1, format: 'png', widthPt: 100, heightPt: 50 }
    ], { page: { widthPt: 595, heightPt: 842 }, title: 'T & T' });
    const { files, doc } = unzipDoc(bytes);
    expect(doc).toContain('w:pStyle w:val="Heading1"');
    expect(doc).toContain('<w:jc w:val="center"/>');
    expect(doc).toContain('<w:b/>'); expect(doc).toContain('<w:i/>');
    expect(doc).toContain('<w:pageBreakBefore/>');
    expect(doc).toContain('<w:numPr>');
    expect(doc).toContain('r:embed="rIdImg1"');
    expect(files['word/media/image1.png']).toEqual(PNG_1x1);
    expect(strFromU8(files['[Content_Types].xml'])).toContain('image/png');
    expect(strFromU8(files['docProps/core.xml'])).toContain('T &amp; T');
  });
  it('handles an empty document', () => {
    expect(unzipDoc(buildDocx([], { page: { widthPt: 595, heightPt: 842 } })).doc).toContain('<w:p/>');
  });
});

const item = (str: string, x: number, y: number, size = 11, extra: Partial<TextItem> = {}): TextItem =>
  ({ str, x, y, w: str.length * size * 0.5, size, bold: false, italic: false, ...extra });
const page = (items: TextItem[]): PageInput => ({ width: 595, height: 842, items });
const text = (p: { runs: { text: string }[] }) => p.runs.map((r) => r.text).join('');

describe('layout analysis', () => {
  it('orders lines top to bottom and items left to right, adding spaces for gaps', () => {
    const lines = buildLines([item('world', 100, 700), item('Hello', 60, 700), item('Second', 60, 680)]);
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'Second']);
  });
  it('does not double spaces when the PDF already has a space item', () => {
    const lines = buildLines([item('Hello', 60, 700), item(' ', 90, 700), item('world', 95, 700)]);
    expect(lines[0].text).toBe('Hello world');
  });
  it('joins wrapped lines into one paragraph and splits on a big gap', () => {
    const b = pageToBlocks(page([
      item('This is a long sentence that wraps', 60, 700), item('onto the next line.', 60, 686),
      item('A new paragraph starts here.', 60, 650)
    ]), 11);
    expect(b.map(text)).toEqual(['This is a long sentence that wraps onto the next line.', 'A new paragraph starts here.']);
  });
  it('removes the hyphen when a word is split across lines', () => {
    const b = pageToBlocks(page([item('The inter-', 60, 700), item('national team won', 60, 686)]), 11);
    expect(text(b[0])).toBe('The international team won');
  });
  it('keeps a real hyphen before a capital or digit', () => {
    const b = pageToBlocks(page([item('Smith-', 60, 700), item('Jones agreed', 60, 686)]), 11);
    expect(text(b[0])).toBe('Smith- Jones agreed');
  });
  it('makes larger text a heading, by size ratio', () => {
    const b = pageToBlocks(page([item('Big Title', 60, 760, 24), item('Section', 60, 720, 15), item('Body text goes here.', 60, 690)]), 11);
    expect(b.map((p) => p.heading)).toEqual([1, 2, undefined]);
    expect(b[0].runs.every((r) => !r.bold && !r.size)).toBe(true);
  });
  it('treats a short all-bold line without a full stop as a heading, but not bold prose', () => {
    const b = pageToBlocks(page([
      item('Overview', 60, 760, 11, { bold: true }),
      item('Bold sentence that ends with a full stop.', 60, 700, 11, { bold: true })
    ]), 11);
    expect(b[0].heading).toBe(3); expect(b[1].heading).toBeUndefined();
  });
  it('detects bullets, strips the marker and keeps wrapped bullet text together', () => {
    const b = pageToBlocks(page([
      item('\u2022 First point that is long', 60, 700), item('and wraps here', 74, 686), item('\u2022 Second point', 60, 672)
    ]), 11);
    expect(b.map((p) => [p.bullet, text(p)])).toEqual([[true, 'First point that is long and wraps here'], [true, 'Second point']]);
  });
  it('centres short centred lines', () => {
    const w = 'Centred line'.length * 5.5;
    const b = pageToBlocks(page([item('Centred line', (595 - w) / 2, 700), item('Left aligned body text for width', 60, 600), item('and more of it so the column is wide', 60, 586)]), 11);
    expect(b[0].align).toBe('center');
    expect(b[1].align).toBeUndefined();
  });
  it('keeps bold and italic runs', () => {
    const b = pageToBlocks(page([item('Plain ', 60, 700), item('bold', 90, 700, 11, { bold: true }), item(' end', 112, 700)]), 11);
    expect(b[0].runs.map((r) => [r.text, !!r.bold])).toEqual([['Plain ', false], ['bold', true], [' end', false]]);
  });
  it('drops a lone page number at the bottom of the page only', () => {
    const b = pageToBlocks(page([item('Real text here', 60, 700), item('3', 295, 30), item('42', 60, 400)]), 11);
    expect(b.map(text)).toEqual(['Real text here', '42']);
  });
  it('picks the most common size as body size', () => {
    expect(bodySize([page([item('aaaaaaaaaa', 0, 0, 10), item('bbbbbbbbbbbbbbbbbbbb', 0, 20, 12), item('big', 0, 40, 30)])])).toBe(12);
    expect(bodySize([page([])])).toBe(11);
  });
  it('returns nothing for a page without text', () => { expect(pageToBlocks(page([]), 11)).toEqual([]); });
});

// ---- end to end with a real PDF read by the real pdf.js -----------------------------------------------------------

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let p = pdf.addPage([595, 842]);
  p.drawText('Quarterly Report', { x: 150, y: 780, size: 26, font: bold });
  p.drawText('1. Summary', { x: 54, y: 730, size: 16, font: bold });
  const para = ['Revenue grew steadily during the quarter, driven by strong demand', 'in every region. Costs stayed flat, which improved the margin.'];
  para.forEach((l, i) => p.drawText(l, { x: 54, y: 700 - i * 14, size: 11, font: reg }));
  p.drawText('Note: ', { x: 54, y: 660, size: 11, font: bold });
  p.drawText('figures are unaudited.', { x: 84, y: 660, size: 11, font: ital });
  ['\u2022 North America up 12%', '\u2022 Europe up 8%'].forEach((l, i) => p.drawText(l, { x: 54, y: 630 - i * 14, size: 11, font: reg }));
  p.drawText('1', { x: 297, y: 30, size: 10, font: reg });
  p = pdf.addPage([595, 842]);
  p.drawText('Second page text with a caf\u00E9 & <tags>.', { x: 54, y: 780, size: 11, font: reg });
  pdf.addPage([595, 842]); // blank, as a scan with no text would look
  return pdf.save();
}

describe('pdf to docx, end to end', () => {
  it('converts a real PDF through pdf.js', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: await samplePdf(), useSystemFonts: false, verbosity: 0 }).promise;
    const r = await pdfToDocx(doc as unknown as PdfDocLike, {
      title: 'Sample', renderPageImage: async () => ({ bytes: PNG_1x1, format: 'png', widthPt: 595, heightPt: 842 })
    });
    expect(r).toMatchObject({ pages: 3, textPages: 2, imagePages: 1, emptyPages: 0, truncated: false });
    const { doc: xml, files } = unzipDoc(r.bytes);
    expect(xml).toContain('Quarterly Report');
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('Revenue grew steadily during the quarter, driven by strong demand in every region. Costs stayed flat, which improved the margin.');
    expect(xml).toContain('caf\u00E9 &amp; &lt;tags&gt;.');
    expect(xml).toContain('<w:numPr>');                     // bullets
    expect(xml).toMatch(/<w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">Note: <\/w:t>/);                 // real bold from pdf.js
    expect(xml).toMatch(/<w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">figures are unaudited\.<\/w:t>/); // real italic
    expect(xml).not.toMatch(/<w:t[^>]*>1<\/w:t>/);          // page number removed
    expect(files['word/media/image1.png']).toBeTruthy();    // the textless page became a picture
    if (process.env.DOCX_OUT) writeFileSync(process.env.DOCX_OUT, r.bytes);
  });
  it('leaves textless pages empty when no renderer is given and reports truncation', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: await samplePdf(), verbosity: 0 }).promise;
    const r = await pdfToDocx(doc as unknown as PdfDocLike, { maxPages: 3 });
    expect(r.emptyPages).toBe(1);
    const t = await pdfToDocx(doc as unknown as PdfDocLike, { maxPages: 2 });
    expect(t).toMatchObject({ pages: 2, truncated: true });
  });
});

describe('registry', () => {
  it('lists the tool', () => { const t = toolBySlug('pdf-to-docx'); expect(t?.kind).toBe('pdf'); expect(t?.category).toBe('Document'); });
});

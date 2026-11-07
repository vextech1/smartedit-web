import { describe, expect, it } from 'vitest';
import { sortFiles, pictureOptions, optionsTitle, turnedAwayNote, MIXED_SELECTION } from '../src/lib/core/intake';

const f = (name: string, type: string) => new File(['x'], name, { type });

describe('sortFiles', () => {
  it('separates PDFs, pictures and everything else, keeping order', () => {
    const s = sortFiles([f('a.pdf', 'application/pdf'), f('b.png', 'image/png'), f('c.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), f('d.jpg', 'image/jpeg'), f('e.txt', 'text/plain'), f('g.bin', '')]);
    expect(s.pdfs.map((x) => x.name)).toEqual(['a.pdf']);
    expect(s.pictures.map((x) => x.name)).toEqual(['b.png', 'd.jpg']);
    expect(s.other.map((x) => x.name)).toEqual(['c.docx', 'e.txt', 'g.bin']);
  });
  it('handles an empty list', () => expect(sortFiles([])).toEqual({ pdfs: [], pictures: [], other: [] }));
});

describe('pictureOptions', () => {
  const ids = (n: number, open: boolean) => pictureOptions(n, open).map((t) => t.id);
  it('offers Make PDF, Read text and Edit picture when no PDF is open', () => expect(ids(1, false)).toEqual(['make-pdf', 'read-text', 'edit-image']));
  it('adds "Add to open PDF" first, only when a PDF is open', () => {
    expect(ids(2, true)).toEqual(['add-to-pdf', 'make-pdf', 'read-text', 'edit-image']);
    expect(ids(2, false)).not.toContain('add-to-pdf');
  });
  it('calls the tile "Make a new PDF" when another PDF is already open', () => {
    expect(pictureOptions(1, true).find((t) => t.id === 'make-pdf')!.label).toBe('Make a new PDF');
    expect(pictureOptions(1, false).find((t) => t.id === 'make-pdf')!.label).toBe('Make a PDF');
  });
  it('turns Edit picture off for several pictures, and says why', () => {
    const edit = (n: number) => pictureOptions(n, false).find((t) => t.id === 'edit-image')!;
    expect(edit(1).disabled).toBe(false);
    expect(edit(3).disabled).toBe(true); expect(edit(3).note).toBe('One picture at a time');
  });
  it('counts pages with the right grammar and leaves every other tile on', () => {
    expect(pictureOptions(1, false)[0].note).toBe('1 page, one per picture');
    expect(pictureOptions(4, true)[0].note).toBe('4 pages at the end');
    expect(pictureOptions(4, true).filter((t) => t.disabled).map((t) => t.id)).toEqual(['edit-image']);
  });
  it('titles the sheet for one or many pictures', () => { expect(optionsTitle(1)).toBe('This picture'); expect(optionsTitle(5)).toBe('These 5 pictures'); });
});

describe('turnedAwayNote', () => {
  it('says nothing when nothing was turned away', () => expect(turnedAwayNote('document', [])).toBe(''));
  it('tells Document Studio what it opens, and that Word and text can be made but not opened', () => {
    const n = turnedAwayNote('document', [f('cv.docx', 'x/y')]);
    expect(n).toContain('Document Studio opens PDFs and pictures'); expect(n).toContain('Word and text files can be made here, but not opened');
    expect(n).toContain('Skipped: cv.docx.');
  });
  it('sends PDFs from Image Studio to Document Studio', () => {
    const n = turnedAwayNote('image', [f('a.pdf', 'application/pdf')]);
    expect(n).toContain('Image Studio opens pictures'); expect(n).toContain('PDFs open in Document Studio'); expect(n).toContain('Skipped: a.pdf.');
  });
  it('lists at most three names, then counts the rest', () => {
    const n = turnedAwayNote('document', ['1', '2', '3', '4', '5'].map((x) => f(`${x}.txt`, 'text/plain')));
    expect(n).toContain('Skipped: 1.txt, 2.txt, 3.txt and 2 more.');
  });
});
it('has a message for mixed selections', () => expect(MIXED_SELECTION).toMatch(/separately/));

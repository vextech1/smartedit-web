// Minimal DOCX writer. A .docx is a ZIP of XML files, so this needs only fflate (already a dependency).
// Framework-free and Node-testable. Supports paragraphs, headings, bullets, bold/italic runs, alignment,
// inline PNG/JPEG images and page breaks, which is what PDF to DOCX produces.
import { zipSync, strToU8 } from 'fflate';

export interface Run { text: string; bold?: boolean; italic?: boolean; size?: number /* points */ }
export interface ParagraphBlock {
  type: 'paragraph';
  runs: Run[];
  heading?: 1 | 2 | 3;
  bullet?: boolean;
  align?: 'left' | 'center' | 'right';
  indent?: number;         // left indent in points
  spaceAfter?: number;     // points
  pageBreakBefore?: boolean;
}
export interface ImageBlock {
  type: 'image';
  bytes: Uint8Array;
  format: 'png' | 'jpeg';
  widthPt: number; heightPt: number;
  align?: 'left' | 'center' | 'right';
  pageBreakBefore?: boolean;
}
export type Block = ParagraphBlock | ImageBlock;
export interface DocxPage { widthPt: number; heightPt: number; marginPt?: number }
export interface DocxOptions { title?: string; page: DocxPage; font?: string; baseSize?: number }

/** Remove characters XML 1.0 forbids, then escape the five special ones. */
export function xmlEscape(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const tw = (pt: number) => Math.round(pt * 20);       // points -> twentieths of a point (DXA)
const emu = (pt: number) => Math.round(pt * 12700);   // points -> EMU
const halfPt = (pt: number) => Math.max(2, Math.round(pt * 2));

function runXml(r: Run): string {
  if (!r.text) return '';
  const props = (r.bold ? '<w:b/>' : '') + (r.italic ? '<w:i/>' : '') + (r.size ? `<w:sz w:val="${halfPt(r.size)}"/><w:szCs w:val="${halfPt(r.size)}"/>` : '');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`;
}

function paragraphXml(p: ParagraphBlock): string {
  const pr: string[] = [];
  if (p.heading) pr.push(`<w:pStyle w:val="Heading${p.heading}"/>`);
  if (p.pageBreakBefore) pr.push('<w:pageBreakBefore/>');
  if (p.bullet) pr.push('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
  if (p.spaceAfter !== undefined) pr.push(`<w:spacing w:after="${tw(p.spaceAfter)}"/>`);
  if (p.indent && !p.bullet) pr.push(`<w:ind w:left="${tw(p.indent)}"/>`);
  if (p.align && p.align !== 'left') pr.push(`<w:jc w:val="${p.align}"/>`);
  return `<w:p>${pr.length ? `<w:pPr>${pr.join('')}</w:pPr>` : ''}${p.runs.map(runXml).join('')}</w:p>`;
}

function imageXml(img: ImageBlock, rid: string, id: number): string {
  const cx = emu(img.widthPt), cy = emu(img.heightPt), name = `Picture ${id}`;
  const pr = (img.pageBreakBefore ? '<w:pageBreakBefore/>' : '') + (img.align && img.align !== 'left' ? `<w:jc w:val="${img.align}"/>` : '');
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${name}"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>`
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function stylesXml(font: string, base: number): string {
  const f = xmlEscape(font);
  const heading = (n: number, size: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>`
    + `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>`
    + `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/><w:b/><w:bCs/><w:sz w:val="${halfPt(size)}"/><w:szCs w:val="${halfPt(size)}"/></w:rPr></w:style>`;
  return `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`
    + `<w:sz w:val="${halfPt(base)}"/><w:szCs w:val="${halfPt(base)}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
    + heading(1, base * 1.9) + heading(2, base * 1.5) + heading(3, base * 1.25) + `</w:styles>`;
}

const NUMBERING = `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>`
  + `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/><w:lvlJc w:val="left"/>`
  + `<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr></w:lvl>`
  + `</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

/** Build the .docx file bytes. */
export function buildDocx(blocks: Block[], opt: DocxOptions): Uint8Array {
  const font = opt.font ?? 'Calibri', base = opt.baseSize ?? 11;
  const { widthPt, heightPt } = opt.page, margin = opt.page.marginPt ?? 54;
  const files: Record<string, Uint8Array> = {};
  const rels: string[] = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
  ];
  let imgN = 0; const exts = new Set<string>(['xml', 'rels']);
  const body = blocks.map((b) => {
    if (b.type === 'paragraph') return paragraphXml(b);
    imgN++;
    const ext = b.format === 'jpeg' ? 'jpeg' : 'png', rid = `rIdImg${imgN}`;
    exts.add(ext);
    files[`word/media/image${imgN}.${ext}`] = b.bytes;
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imgN}.${ext}"/>`);
    return imageXml(b, rid, imgN);
  }).join('');

  const sect = `<w:sectPr><w:pgSz w:w="${tw(widthPt)}" w:h="${tw(heightPt)}"/>`
    + `<w:pgMar w:top="${tw(margin)}" w:right="${tw(margin)}" w:bottom="${tw(margin)}" w:left="${tw(margin)}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  // A document must contain at least one paragraph before sectPr.
  const content = body || '<w:p/>';

  const types = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + (exts.has('png') ? '<Default Extension="png" ContentType="image/png"/>' : '')
    + (exts.has('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '')
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
    + `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
    + `</Types>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" `
    + `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${xmlEscape(opt.title ?? '')}</dc:title>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const out: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(types),
    '_rels/.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
      + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(core),
    'word/document.xml': strToU8(`${XML}<w:document ${NS}><w:body>${content}${sect}</w:body></w:document>`),
    'word/styles.xml': strToU8(stylesXml(font, base)),
    'word/numbering.xml': strToU8(NUMBERING),
    'word/_rels/document.xml.rels': strToU8(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`),
    ...files
  };
  // Images are already compressed; XML compresses well.
  return zipSync(out, { level: 6, mtime: new Date(2020, 0, 1) });
}

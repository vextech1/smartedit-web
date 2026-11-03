// Copies the OCR engine out of node_modules and downloads the language data into static/ocr/, so the site serves
// everything itself (no third-party CDN at runtime). Runs automatically before `dev` and `build`.
// static/ocr/ is git-ignored; files that are already present and match their checksum are not downloaded again.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'static', 'ocr');
// Language data (@tesseract.js-data/<lang>@1.0.0, 4.0.0_best_int). Every file is checked against the SHA-256 below, so a
// tampered or truncated download fails the build instead of being served to visitors. Update both lines together when upgrading.
const SHA256 = {
  eng: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91', spa: '40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb',
  fra: 'd611139672b3752c7097e671e4a1d9209dfd37f2aeb081ef6487fba3351e9255', deu: '306c4280d0cbed46fbff727486bd43b92730181bae80f56941a091f363bdf28b',
  ita: 'f702fcfad297ce028ede3626d1467b67939f23ff23595f9badd54681cf25a4d3', por: 'dacebc1386ddaaf8389f81094236cca0d690897cde693d48cbdaa881c86e2b4c',
  nld: 'a2d904b6ddc4feb0d31ecfcd7361a554102e7aa2e278c54f4fc029e0d0815571', rus: 'f51f5edc992249ff9b70a227b22f242dfa47b2b1bbc7ae0ea74908640c101f6a',
  tur: '384ba0dc28040451b7818d7d60e0a88df0d3003fa5a01d713a468779bc3d8c04', ara: 'f4746c44b02342dd5b3d4f0198000f47d7c49f1a229e63e0f436c0592dcd9639',
  hin: 'f3b6a0d320df38d886178cdd727b90dbf9df3db053adb32bd9cf73f0463cda07', chi_sim: 'b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c',
  chi_tra: '11fe2610dab05d8a880d02f193ce70203f4c4bbe061b987d5529a2c038a22743', jpn: '2b63ebfbf1484de4a08ce53b29ef98a1c17658a93cbd38acb665d7d316d0be88',
  kor: '78c21276ab14c9bb734d83be1055d9fe5469a4e7e977c51ad385be5737e61126'
};
const LANGS = Object.keys(SHA256);
// Two mirrors of the same npm package files; the second is only tried if the first is down or serves a bad file.
const MIRRORS = [
  (l) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${l}@1.0.0/4.0.0_best_int/${l}.traineddata.gz`,
  (l) => `https://unpkg.com/@tesseract.js-data/${l}@1.0.0/4.0.0_best_int/${l}.traineddata.gz`
];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const optional = process.env.OCR_ASSETS_OPTIONAL === '1';

mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

// Worker + WASM core come from the installed packages (versions match package-lock.json).
const worker = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const coreDir = join(root, 'node_modules', 'tesseract.js-core');
if (!existsSync(worker) || !existsSync(coreDir)) throw new Error('Run `npm ci` first: tesseract.js is not installed.');
copyFileSync(worker, join(out, 'worker.min.js'));
const coreFiles = readdirSync(coreDir).filter((f) => /^tesseract-core.*\.(js|wasm)$/.test(f));
if (!coreFiles.length) throw new Error('No tesseract-core files found in node_modules/tesseract.js-core.');
for (const f of coreFiles) copyFileSync(join(coreDir, f), join(out, 'core', f));

const failed = [];
for (const l of LANGS) {
  const dest = join(out, 'lang', `${l}.traineddata.gz`);
  if (existsSync(dest)) {
    if (sha(readFileSync(dest)) === SHA256[l]) continue;   // already here and correct
    unlinkSync(dest);                                       // stale or corrupt: fetch again
  }
  const why = [];
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url(l));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha(buf) !== SHA256[l]) throw new Error('checksum mismatch');
      writeFileSync(dest, buf); console.log(`ocr: downloaded ${l}`); why.length = 0; break;
    } catch (e) { why.push(e.message); }
  }
  if (why.length) failed.push(`${l} (${why.join(', ')})`);
}
if (failed.length) {
  const msg = `OCR language data could not be downloaded: ${failed.join(', ')}`;
  if (optional) console.warn(`ocr: ${msg}`); else { console.error(`ocr: ${msg}\nSet OCR_ASSETS_OPTIONAL=1 to build without them.`); process.exit(1); }
}
console.log(`ocr: ready (${coreFiles.length} core files, ${LANGS.length - failed.length}/${LANGS.length} languages)`);

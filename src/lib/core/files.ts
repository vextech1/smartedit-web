export async function readBytes(file: Blob): Promise<Uint8Array> { return new Uint8Array(await file.arrayBuffer()); }
export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });
export const zipBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/zip' });

/** Plain-language message for a PDF that failed to open or save. */
export function pdfErrorMessage(e: unknown, name: string): string {
  const n = (e as { name?: string })?.name ?? '';
  const m = String((e as { message?: string })?.message ?? '');
  if (n === 'PasswordException' || /encrypt|password/i.test(m))
    return `“${name}” is password-protected. Remove the password in your PDF app first, then try again.`;
  if (/empty|zero bytes|size is zero/i.test(m)) return `“${name}” is empty.`;
  if (n === 'InvalidPDFException' || n === 'XRefParseException' || /parse|invalid pdf|no pdf header|invalid xref|bad xref|trailer/i.test(m)) return `“${name}” could not be read. It may be damaged.`;
  if (n === 'QuotaExceededError') return 'This device has no room left to keep that. Free up space in Settings, or download your work first.';
  if (/allocation failed|out of memory|invalid (typed )?array length|array buffer allocation/i.test(m)) return `“${name}” is too large for this device to handle. Try a smaller file.`;
  return 'Something went wrong. Try a smaller file.';
}

function matchesAccept(type: string, accept: string): boolean {
  return accept.split(',').some((entry) => {
    const accepted = entry.trim();
    return accepted.endsWith('/*') ? type.startsWith(accepted.slice(0, -1)) : type === accepted;
  });
}

export async function screenFiles(files: File[], accept: string): Promise<{ files: File[]; skipped: File[] }> {
  const accepted: File[] = [], skipped: File[] = [];
  for (const file of files) (matchesAccept(file.type, accept) ? accepted : skipped).push(file);
  return { files: accepted, skipped };
}

export function skippedMessage(skipped: File[]): string {
  if (!skipped.length) return '';
  const names = skipped.slice(0, 3).map((file) => file.name).join(', ');
  const more = skipped.length > 3 ? ` and ${skipped.length - 3} more` : '';
  return `Unsupported file${skipped.length === 1 ? '' : 's'} skipped: ${names}${more}.`;
}
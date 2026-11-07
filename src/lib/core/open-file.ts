// "Open" for a result file: hand it to the device's share sheet so any app that can open it (Word, Files, a text editor) can.
export const NO_APP_MESSAGE = 'No app on this device can open this document. Download it instead.';
/** `opened`: the share sheet took it. `cancelled`: the person closed the sheet. `no-app`: this device has nothing to open it with. */
export type OpenResult = 'opened' | 'cancelled' | 'no-app';

type ShareNav = Pick<Navigator, 'share' | 'canShare'>;
export async function openWithApp(file: File, nav: Partial<ShareNav> = typeof navigator === 'undefined' ? {} : navigator): Promise<OpenResult> {
  if (typeof nav.share !== 'function') return 'no-app';
  try {
    if (typeof nav.canShare === 'function' && !nav.canShare({ files: [file] })) return 'no-app';
    await nav.share({ files: [file], title: file.name });
    return 'opened';
  } catch (e) {
    return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'no-app';
  }
}

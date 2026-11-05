# Workspaces plan: work on one file without losing progress

**Problem.** The 27 tools are separate pages. A person who crops a PDF, numbers it and compresses it has to download and re-pick the file between every step, and any unsaved work is lost when they leave a page.

**Goal.** Load a file once, keep it in a *session*, and let every tool work on that same session. Nothing is uploaded and there are no accounts (see `ARCHITECTURE.md`).

## 1. Four workspaces (every tool belongs to exactly one)

| Workspace | Working file | Tabs (tool slugs, in workflow order) |
|---|---|---|
| **PDF Studio** | PDF in, PDF out | organize-pdf, merge-pdf, split-pdf, crop-pdf, page-numbers, watermark-pdf, pdf-metadata, compress-pdf |
| **Photo Studio** | image in, image out | edit-image, rotate-images, resize-image, round-image, annotate-image, redact-image, watermark-image, photo-frames, collage-images, compress-image, convert-image, color-picker |
| **Convert & Extract** | changes the file type | images-to-pdf, pdf-to-images, extract-images |
| **Scan & Documents** | paper or PDF to text | scan-document, extract-text, pdf-to-docx, pdf-to-text |

Scan stays inside *Scan & Documents* because it is one tool and always leads to PDF, OCR or Word.
The standalone `/tools/<slug>` pages stay (search landing pages, sitemap, SEO). Each links to its studio.

## 2. Session layer (`core/session.ts`)

- A session is a chain of **versions** of one file: *Original*, then one version per applied result. A `head` pointer gives undo and redo; a new result after an undo drops the redo branch.
- Stored on the device only: IndexedDB database `smartedit-sessions` (metadata and file bytes in separate object stores, same pattern as `library.ts`). Kept apart from My Files so the library stays tidy; **Save to My files** promotes a version into the library.
- Limits: the Original plus the latest 9 versions (older ones pruned); an identical result is not stored twice; on `QuotaExceededError` the session is compacted to Original + head and the commit is retried once.
- Retention: sessions expire after N days without use (Settings: 1, 7 default, 30, or until I delete). **Pinned** sessions never expire. The sweep runs when the app starts. `navigator.storage.persist()` is requested on the first commit.
- Logic is framework-free and tested in Node against `MemorySessionStore`.

## 3. How tools plug in with almost no per-tool rewrite

- **Input:** `FileDrop` reads the studio context. If a session is open and the file fits the tool, it is delivered through `onfiles` on mount, exactly like the existing Home hand-off. Secondary drop zones (logo pickers) opt out.
- **Output:** every result already goes through `SaveButton` or `ResultRow`. `SaveButton` gains a **Next** button that opens the *Next steps* dialog:
  - **Keep editing** (same kind of file): commit the result as a new version; the current tab reloads on it.
  - **Send to…** (other kinds or other studios): starts a session in the target studio at the right tab.
  - suggestions come from `nextSteps()` in `core/workspaces.ts`, by file type.
- **Tabs stay alive** while the head version has not changed, so a half-finished edit in one tab survives a look at another. A tab whose input is out of date reloads when opened.

## 4. Screens

- `/studio/<id>?tab=<slug>&s=<session>`: header (file name, version count, Undo, Redo, Save to My files, Pin, Close), scrolling tab bar, tool panel. With no session it shows the drop zone and **Continue** cards for recent sessions.
- `/tools`: four workspace cards and a **Continue** row at the top; tiles open the matching studio tab.
- Home: picked files go to the matching studio tab (`routeFor`).
- Settings: retention choice and in-progress storage use; **Clear all** also clears sessions.

## 5. Phases and status

1. [x] Plan, baseline (262 tests, 0 type errors)
2. [x] `core/workspaces.ts` (registry, `workspaceFor`, `nextSteps`) with tests
3. [x] `core/session.ts` (store, versions, undo/redo, prune, retention) with tests
4. [x] Settings: retention; sweep on start; Clear all includes sessions
5. [x] Studio state, `FileDrop` + `SaveButton` hooks, Next steps dialog, `ToolView` extraction
6. [x] `/studio/[id]` route, Tools page and Home routing, sitemap
7. [x] Type check, tests, production build, architecture notes

## 6. Deferred

- Per-tool dirty tracking and a leave-guard for edits that are not applied yet (today every *applied* result is already saved).
- Cross-device sync, export/import of sessions as a ZIP, File System Access folder saving on desktop Chrome.
- Android app: reuse the same version-chain model on app-private storage.

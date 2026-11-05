import type { PageSpec } from './pdf-edit.ts';

export const pageIndex = (value: number, total: number) => Math.max(0, Math.min(Math.max(0, total - 1), Math.trunc(value)));

export function initialPages(total: number): PageSpec[] {
  return Array.from({ length: Math.max(0, total) }, (_, index) => ({ index, rotate: 0 }));
}

export function movePage(pages: PageSpec[], index: number, offset: number): PageSpec[] {
  const next = pages.map((page) => ({ ...page }));
  const target = index + offset;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function rotatePage(pages: PageSpec[], index: number, degrees: number): PageSpec[] {
  if (index < 0 || index >= pages.length) return pages;
  return pages.map((page, i) => i === index ? { ...page, rotate: ((page.rotate + degrees) % 360 + 360) % 360 } : page);
}

export function removePage(pages: PageSpec[], index: number): PageSpec[] {
  return pages.length <= 1 || index < 0 || index >= pages.length ? pages : pages.filter((_, i) => i !== index);
}
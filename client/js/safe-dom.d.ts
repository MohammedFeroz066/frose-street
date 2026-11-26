export function safeImageUrl(url: string): string;
export function el(
  tag: string,
  attrs?: Record<string, unknown>,
  children?: unknown,
): HTMLElement;
export function svgEl(
  tag: string,
  attrs?: Record<string, unknown>,
  children?: unknown,
): SVGElement;
export function clear<T extends Node>(node: T): T;

import { CanvasConnection, CanvasElement } from '../../core/models/models';

export function portCoords(el: CanvasElement, port: 'n' | 's' | 'e' | 'w' | undefined): { x: number; y: number } {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  switch (port) {
    case 'n': return { x: cx, y: el.y };
    case 's': return { x: cx, y: el.y + el.height };
    case 'e': return { x: el.x + el.width, y: cy };
    case 'w': return { x: el.x, y: cy };
    default: return { x: cx, y: cy };
  }
}

export function connectionPath(
  from: CanvasElement,
  to: CanvasElement,
  conn: Pick<CanvasConnection, 'style' | 'fromPort' | 'toPort'>
): string {
  const p1 = portCoords(from, conn.fromPort ?? autoPort(from, to));
  const p2 = portCoords(to, conn.toPort ?? autoPort(to, from));
  if (conn.style === 'straight') {
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }
  if (conn.style === 'orthogonal') {
    const midX = (p1.x + p2.x) / 2;
    return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
  }
  const dx = Math.abs(p2.x - p1.x) * 0.5;
  return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
}

function autoPort(a: CanvasElement, b: CanvasElement): 'n' | 's' | 'e' | 'w' {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}

export function snapToGrid(v: number, grid: number): number {
  if (!grid || grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

export type AlignmentGuide = {
  orientation: 'v' | 'h';
  coord: number;
  start: number;
  end: number;
};

/**
 * Compute alignment guide lines between the moving (selected) elements and
 * the stationary others. A guide appears when the dragged element's left/
 * right/center (x) or top/bottom/center (y) lines up with another element's
 * corresponding line within `threshold` pixels. The returned coords snap to
 * the stationary reference so the guide visually anchors to the target.
 */
export function computeAlignmentGuides(
  movingIds: ReadonlySet<string> | string[],
  elements: ReadonlyArray<CanvasElement>,
  threshold = 4
): AlignmentGuide[] {
  const moveSet = movingIds instanceof Set ? movingIds : new Set(movingIds);
  const movers = elements.filter((e) => moveSet.has(e.id));
  const others = elements.filter((e) => !moveSet.has(e.id));
  if (movers.length === 0 || others.length === 0) return [];

  const out: AlignmentGuide[] = [];
  const seen = new Set<string>();

  for (const m of movers) {
    const mXs = [m.x, m.x + m.width / 2, m.x + m.width];
    const mYs = [m.y, m.y + m.height / 2, m.y + m.height];
    for (const o of others) {
      const oXs = [o.x, o.x + o.width / 2, o.x + o.width];
      const oYs = [o.y, o.y + o.height / 2, o.y + o.height];
      for (const mx of mXs) for (const ox of oXs) {
        if (Math.abs(mx - ox) <= threshold) {
          const start = Math.min(m.y, o.y);
          const end = Math.max(m.y + m.height, o.y + o.height);
          const key = `v:${ox}:${start}:${end}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ orientation: 'v', coord: ox, start, end });
        }
      }
      for (const my of mYs) for (const oy of oYs) {
        if (Math.abs(my - oy) <= threshold) {
          const start = Math.min(m.x, o.x);
          const end = Math.max(m.x + m.width, o.x + o.width);
          const key = `h:${oy}:${start}:${end}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ orientation: 'h', coord: oy, start, end });
        }
      }
    }
  }
  return out;
}

export function canvasBounds(elements: CanvasElement[]): { x: number; y: number; width: number; height: number } {
  if (elements.length === 0) return { x: 0, y: 0, width: 800, height: 600 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of elements) {
    minX = Math.min(minX, e.x);
    minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width);
    maxY = Math.max(maxY, e.y + e.height);
  }
  return { x: minX - 20, y: minY - 20, width: Math.max(100, maxX - minX + 40), height: Math.max(100, maxY - minY + 40) };
}

export function renderStandaloneSvg(
  elements: CanvasElement[],
  connections: CanvasConnection[],
  blobMap: Record<string, string>
): string {
  const bounds = canvasBounds(elements);
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">`);
  parts.push(`<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#0f172a" />`);
  for (const c of connections) {
    const from = elements.find((e) => e.id === c.fromId);
    const to = elements.find((e) => e.id === c.toId);
    if (!from || !to) continue;
    const d = connectionPath(from, to, c);
    parts.push(`<path d="${d}" stroke="${esc(c.color ?? '#94a3b8')}" stroke-width="${c.strokeWidth ?? 2}" fill="none" />`);
  }
  const sorted = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const el of sorted) {
    parts.push(renderElementSvg(el, blobMap));
  }
  parts.push(`</svg>`);
  return parts.join('\n');
}

function renderElementSvg(el: CanvasElement, blobMap: Record<string, string>): string {
  const opacity = el.opacity ?? 1;
  switch (el.type) {
    case 'image': {
      const href = el.imageRef ? blobMap[el.imageRef] : undefined;
      if (href) {
        return `<image x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" href="${esc(href)}" opacity="${opacity}" />`;
      }
      return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" fill="${esc(el.backgroundColor ?? '#0f172a')}" stroke="${esc(el.borderColor ?? '#334155')}" stroke-dasharray="4 4" opacity="${opacity}" /><text x="${el.x + el.width/2}" y="${el.y + el.height/2}" text-anchor="middle" fill="${esc(el.textColor ?? '#94a3b8')}" font-size="12">image</text>`;
    }
    case 'text':
      return textSvg(el, true);
    case 'label':
      return textSvgLeft(el);
    case 'container': {
      const rect = `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${el.borderRadius ?? 6}" ry="${el.borderRadius ?? 6}" fill="${esc(el.backgroundColor ?? 'transparent')}" stroke="${esc(el.borderColor ?? '#64748b')}" stroke-width="${el.borderWidth ?? 2}" stroke-dasharray="6 4" opacity="${opacity}" />`;
      if (!el.text) return rect;
      const tx = el.x + 8;
      const ty = el.y + (el.fontSize ?? 14) + 4;
      return `${rect}<text x="${tx}" y="${ty}" text-anchor="start" fill="${esc(el.textColor ?? '#94a3b8')}" font-size="${el.fontSize ?? 14}" font-family="system-ui, sans-serif">${esc(el.text)}</text>`;
    }
    case 'input': {
      const rect = `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${el.borderRadius ?? 4}" ry="${el.borderRadius ?? 4}" fill="${esc(el.backgroundColor ?? '#0f172a')}" stroke="${esc(el.borderColor ?? '#475569')}" stroke-width="${el.borderWidth ?? 2}" opacity="${opacity}" />`;
      const tx = el.x + 8;
      const ty = el.y + el.height / 2 + (el.fontSize ?? 14) / 3;
      if (el.text) {
        return `${rect}<text x="${tx}" y="${ty}" text-anchor="start" fill="${esc(el.textColor ?? '#e2e8f0')}" font-size="${el.fontSize ?? 14}" font-family="system-ui, sans-serif">${esc(el.text)}</text>`;
      }
      if (el.placeholder) {
        return `${rect}<text x="${tx}" y="${ty}" text-anchor="start" fill="#64748b" font-size="${el.fontSize ?? 14}" font-style="italic" font-family="system-ui, sans-serif">${esc(el.placeholder)}</text>`;
      }
      return rect;
    }
    case 'button':
    case 'sticky-note':
    case 'flow-node':
    default:
      return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${el.borderRadius ?? 4}" ry="${el.borderRadius ?? 4}" fill="${esc(el.backgroundColor ?? '#1e293b')}" stroke="${esc(el.borderColor ?? '#38bdf8')}" stroke-width="${el.borderWidth ?? 2}" opacity="${opacity}" />${textSvg(el)}`;
  }
}

function textSvg(el: CanvasElement, bare = false): string {
  if (!el.text) return '';
  const tx = el.x + el.width / 2;
  const ty = el.y + el.height / 2 + (el.fontSize ?? 14) / 3;
  const base = `<text x="${tx}" y="${ty}" text-anchor="middle" fill="${esc(el.textColor ?? '#e2e8f0')}" font-size="${el.fontSize ?? 14}" font-family="system-ui, sans-serif">${esc(el.text)}</text>`;
  return bare ? base : base;
}

function textSvgLeft(el: CanvasElement): string {
  if (!el.text) return '';
  const tx = el.x;
  const ty = el.y + (el.fontSize ?? 14);
  return `<text x="${tx}" y="${ty}" text-anchor="start" fill="${esc(el.textColor ?? '#cbd5e1')}" font-size="${el.fontSize ?? 14}" font-family="system-ui, sans-serif">${esc(el.text)}</text>`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

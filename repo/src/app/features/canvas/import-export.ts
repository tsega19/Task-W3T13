import { CanvasElement, ELEMENT_TYPES, ElementType } from '../../core/models/models';

export interface RawNode {
  id?: string;
  type?: string;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  text?: string;
  [key: string]: unknown;
}

export interface ImportSkip {
  row: number;
  reason: string;
  raw: RawNode;
}

export interface ImportResult {
  total: number;
  imported: CanvasElement[];
  skipped: ImportSkip[];
  renamed: { original: string; renamed: string }[];
}

export function parseCsv(raw: string): RawNode[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const out: RawNode[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: RawNode = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = cols[c] ?? '';
    }
    out.push(row);
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') { inQuote = true; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export function validateImport(
  raw: string,
  format: 'json' | 'csv',
  existingIds: string[],
  maxNodes: number,
  remainingCap: number
): ImportResult {
  let rows: RawNode[] = [];
  try {
    if (format === 'json') {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed as RawNode[];
      else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { elements?: unknown }).elements)) {
        rows = (parsed as { elements: RawNode[] }).elements;
      } else {
        return { total: 0, imported: [], skipped: [{ row: 0, reason: 'JSON must be an array or {elements:[...]}.', raw: {} }], renamed: [] };
      }
    } else {
      rows = parseCsv(raw);
    }
  } catch (e) {
    return { total: 0, imported: [], skipped: [{ row: 0, reason: `Parse error: ${String(e)}`, raw: {} }], renamed: [] };
  }
  const skipped: ImportSkip[] = [];
  if (rows.length > maxNodes) {
    skipped.push({ row: maxNodes + 1, reason: `File exceeds ${maxNodes}-row limit; extra rows dropped.`, raw: {} });
    rows = rows.slice(0, maxNodes);
  }
  const seen = new Set<string>(existingIds);
  const renamed: { original: string; renamed: string }[] = [];
  const imported: CanvasElement[] = [];
  let rowNum = 0;
  for (const r of rows) {
    rowNum++;
    if (imported.length >= remainingCap) {
      skipped.push({ row: rowNum, reason: 'Canvas element cap reached — remaining rows skipped.', raw: r });
      continue;
    }
    const idRaw = String(r['id'] ?? '').trim();
    const type = String(r['type'] ?? '').trim();
    const xv = Number(r['x']);
    const yv = Number(r['y']);
    if (!idRaw || !type) { skipped.push({ row: rowNum, reason: 'Missing required field (id/type).', raw: r }); continue; }
    if (!ID_RE.test(idRaw)) { skipped.push({ row: rowNum, reason: 'Invalid id format.', raw: r }); continue; }
    if (!ELEMENT_TYPES.includes(type as ElementType)) { skipped.push({ row: rowNum, reason: `Invalid type: ${type}.`, raw: r }); continue; }
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) { skipped.push({ row: rowNum, reason: 'Invalid x/y (must be numeric).', raw: r }); continue; }
    const width = Math.max(10, Number(r['width']) || 140);
    const height = Math.max(10, Number(r['height']) || 80);
    let id = idRaw;
    if (seen.has(id)) {
      let n = 2;
      let cand = `${id}_${n}`;
      while (seen.has(cand)) { n++; cand = `${id}_${n}`; }
      renamed.push({ original: id, renamed: cand });
      id = cand;
    }
    seen.add(id);
    const el: CanvasElement = {
      id,
      type: type as ElementType,
      x: xv,
      y: yv,
      width,
      height,
      text: r['text'] === undefined ? '' : String(r['text']),
      backgroundColor: String(r['backgroundColor'] ?? '#1e293b'),
      borderColor: String(r['borderColor'] ?? '#38bdf8'),
      borderWidth: Number(r['borderWidth']) || 2,
      textColor: String(r['textColor'] ?? '#e2e8f0'),
      fontSize: Number(r['fontSize']) || 14,
      opacity: 1,
      zIndex: imported.length + 1
    };
    imported.push(el);
  }
  return { total: rows.length, imported, skipped, renamed };
}

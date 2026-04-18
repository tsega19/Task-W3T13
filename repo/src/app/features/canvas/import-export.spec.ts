import '../../../test-setup';
import { parseCsv, validateImport } from './import-export';

describe('import-export', () => {
  it('parseCsv handles quoted commas and newlines', () => {
    const raw = 'id,type,x,y,text\na,button,1,2,"hello, world"\nb,input,3,4,note';
    const rows = parseCsv(raw);
    expect(rows.length).toBe(2);
    expect(rows[0]['text']).toBe('hello, world');
  });

  it('parseCsv handles escaped quotes', () => {
    const raw = 'id,text\na,"he said ""hi"""';
    const rows = parseCsv(raw);
    expect(rows[0]['text']).toBe('he said "hi"');
  });

  it('validateImport JSON imports valid rows, skips invalid', () => {
    const data = [
      { id: 'a', type: 'button', x: 1, y: 2 },
      { id: 'b', type: 'invalid-type', x: 1, y: 2 },
      { id: 'c', type: 'input', x: 'nope', y: 2 },
      { id: 'd', type: 'label' },
      { id: 'a', type: 'button', x: 10, y: 20 }
    ];
    const res = validateImport(JSON.stringify(data), 'json', [], 1000, 1000);
    expect(res.imported.length).toBe(2);
    expect(res.skipped.length).toBe(3);
    expect(res.renamed.length).toBe(1);
    expect(res.renamed[0].renamed).toBe('a_2');
  });

  it('validateImport JSON accepts {elements:[...]}', () => {
    const data = { elements: [{ id: 'a', type: 'button', x: 1, y: 2 }] };
    const res = validateImport(JSON.stringify(data), 'json', [], 10, 10);
    expect(res.imported.length).toBe(1);
  });

  it('validateImport handles invalid JSON', () => {
    const res = validateImport('{not-json', 'json', [], 10, 10);
    expect(res.imported.length).toBe(0);
    expect(res.skipped[0].reason).toMatch(/Parse/);
  });

  it('validateImport JSON rejects non-array root', () => {
    const res = validateImport(JSON.stringify(42), 'json', [], 10, 10);
    expect(res.imported.length).toBe(0);
    expect(res.skipped[0].reason).toMatch(/JSON/);
  });

  it('validateImport enforces max row limit', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, type: 'button', x: 0, y: 0 }));
    const res = validateImport(JSON.stringify(rows), 'json', [], 3, 100);
    expect(res.imported.length).toBe(3);
    expect(res.skipped.some((s) => /limit/.test(s.reason))).toBe(true);
  });

  it('validateImport respects remaining cap', () => {
    const rows = [
      { id: 'a', type: 'button', x: 0, y: 0 },
      { id: 'b', type: 'button', x: 0, y: 0 },
      { id: 'c', type: 'button', x: 0, y: 0 }
    ];
    const res = validateImport(JSON.stringify(rows), 'json', [], 10, 1);
    expect(res.imported.length).toBe(1);
    expect(res.skipped.some((s) => /cap/i.test(s.reason))).toBe(true);
  });

  it('validateImport CSV path', () => {
    const csv = 'id,type,x,y\na,button,1,2\nb,invalid,1,2';
    const res = validateImport(csv, 'csv', [], 10, 10);
    expect(res.imported.length).toBe(1);
    expect(res.skipped.length).toBe(1);
  });

  it('rejects legacy shape types no longer in the 8-component set', () => {
    const data = [
      { id: 'r', type: 'rectangle', x: 0, y: 0 },
      { id: 'e', type: 'ellipse', x: 0, y: 0 },
      { id: 'd', type: 'diamond', x: 0, y: 0 },
      { id: 'l', type: 'line', x: 0, y: 0 }
    ];
    const res = validateImport(JSON.stringify(data), 'json', [], 10, 10);
    expect(res.imported.length).toBe(0);
    expect(res.skipped.length).toBe(4);
  });

  it('renames against existing ids and rename collisions', () => {
    const rows = [
      { id: 'a', type: 'button', x: 0, y: 0 },
      { id: 'a', type: 'button', x: 0, y: 0 }
    ];
    const res = validateImport(JSON.stringify(rows), 'json', ['a', 'a_2'], 10, 10);
    expect(res.renamed.length).toBe(2);
    expect(res.renamed.map((r) => r.renamed)).toContain('a_3');
  });

  it('rejects invalid id chars', () => {
    const res = validateImport(JSON.stringify([{ id: 'bad id!', type: 'button', x: 0, y: 0 }]), 'json', [], 10, 10);
    expect(res.imported.length).toBe(0);
    expect(res.skipped[0].reason).toMatch(/id format/);
  });
});
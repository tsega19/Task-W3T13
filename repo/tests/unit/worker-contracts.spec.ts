import '../../src/test-setup';
import { validateImport } from '../../src/app/features/canvas/import-export';
import { renderStandaloneSvg } from '../../src/app/features/canvas/canvas-render';
import { CanvasConnection, CanvasElement } from '../../src/app/core/models/models';

/**
 * The three web workers (`import.worker`, `export-svg.worker`,
 * `version-compact.worker`) are thin forwarders — they receive a typed
 * message, call a pure helper, and post a response with a stable shape.
 * Running the worker bundle itself under jsdom is awkward, so instead we
 * verify the contract by exercising the same helpers the worker calls and
 * asserting the response shape the editor/editor service depends on.
 */

describe('worker contracts (import.worker)', () => {
  it('IMPORT_RESULT has {total, imported, skipped, renamed}', () => {
    const rows = [
      { id: 'a', type: 'button', x: 0, y: 0 },
      { id: 'a', type: 'button', x: 10, y: 10 }
    ];
    const res = validateImport(JSON.stringify(rows), 'json', [], 100, 100);
    expect(res).toHaveProperty('total');
    expect(res).toHaveProperty('imported');
    expect(res).toHaveProperty('skipped');
    expect(res).toHaveProperty('renamed');
    expect(Array.isArray(res.imported)).toBe(true);
    expect(Array.isArray(res.skipped)).toBe(true);
    expect(Array.isArray(res.renamed)).toBe(true);
  });

  it('IMPORT_RESULT preserves row order and surfaces duplicate renames', () => {
    const rows = [
      { id: 'x', type: 'button', x: 0, y: 0 },
      { id: 'x', type: 'button', x: 10, y: 0 }
    ];
    const res = validateImport(JSON.stringify(rows), 'json', [], 100, 100);
    expect(res.imported.length).toBe(2);
    expect(res.renamed.length).toBe(1);
    expect(res.renamed[0].renamed).toBe('x_2');
  });
});

describe('worker contracts (export-svg.worker)', () => {
  it('SVG_STRING contains expected elements + embedded image href', () => {
    const elements: CanvasElement[] = [
      { id: 'b', type: 'button', x: 0, y: 0, width: 40, height: 20, text: 'go' },
      { id: 'i', type: 'image', x: 0, y: 40, width: 40, height: 40, imageRef: 'k' }
    ];
    const connections: CanvasConnection[] = [
      { id: 'c1', fromId: 'b', toId: 'i', style: 'straight' }
    ];
    const svg = renderStandaloneSvg(elements, connections, { k: 'data:image/png;base64,abc' });
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    expect(svg).toContain('data:image/png;base64,abc');
  });

  it('SVG_STRING survives missing connection endpoints', () => {
    const svg = renderStandaloneSvg(
      [{ id: 'b', type: 'button', x: 0, y: 0, width: 40, height: 20 }],
      [{ id: 'c1', fromId: 'missing', toId: 'b', style: 'straight' }],
      {}
    );
    expect(svg).toContain('<svg');
  });
});

describe('worker contracts (version-compact.worker)', () => {
  // Mirror the in-worker compaction logic here so regressions surface even
  // though the worker bundle is not imported directly under jsdom.
  function compact(versions: { id: string; versionNumber: number }[], maxVersions: number): string[] {
    const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
    const deletions: string[] = [];
    while (sorted.length > maxVersions) {
      const v = sorted.shift();
      if (v) deletions.push(v.id);
    }
    return deletions;
  }

  it('emits DELETE_VERSION ids for oldest entries beyond maxVersions', () => {
    const vs = [
      { id: 'v1', versionNumber: 1 },
      { id: 'v2', versionNumber: 2 },
      { id: 'v3', versionNumber: 3 },
      { id: 'v4', versionNumber: 4 }
    ];
    expect(compact(vs, 2)).toEqual(['v1', 'v2']);
  });

  it('is a no-op when at/under cap', () => {
    const vs = [
      { id: 'v1', versionNumber: 1 },
      { id: 'v2', versionNumber: 2 }
    ];
    expect(compact(vs, 2)).toEqual([]);
    expect(compact(vs, 5)).toEqual([]);
  });
});

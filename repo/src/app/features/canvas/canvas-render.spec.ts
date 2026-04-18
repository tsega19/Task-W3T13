import '../../../test-setup';
import { CanvasElement } from '../../core/models/models';
import { canvasBounds, computeAlignmentGuides, connectionPath, portCoords, renderStandaloneSvg, snapToGrid } from './canvas-render';

function rect(id: string, x: number, y: number): CanvasElement {
  return { id, type: 'button', x, y, width: 40, height: 20 };
}

describe('canvas-render', () => {
  it('portCoords returns sides', () => {
    const e = rect('e', 0, 0);
    expect(portCoords(e, 'n')).toEqual({ x: 20, y: 0 });
    expect(portCoords(e, 's').y).toBe(20);
    expect(portCoords(e, 'e').x).toBe(40);
    expect(portCoords(e, 'w').x).toBe(0);
    expect(portCoords(e, undefined)).toEqual({ x: 20, y: 10 });
  });

  it('connectionPath supports 3 styles', () => {
    const a = rect('a', 0, 0);
    const b = rect('b', 200, 100);
    expect(connectionPath(a, b, { style: 'straight' })).toMatch(/^M /);
    expect(connectionPath(a, b, { style: 'orthogonal' })).toMatch(/L/);
    expect(connectionPath(a, b, { style: 'curved' })).toMatch(/C/);
  });

  it('snapToGrid rounds', () => {
    expect(snapToGrid(37, 20)).toBe(40);
    expect(snapToGrid(5, 0)).toBe(5);
  });

  it('canvasBounds handles empty + non-empty', () => {
    expect(canvasBounds([])).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    const b = canvasBounds([rect('a', 10, 10), rect('b', 200, 80)]);
    expect(b.width).toBeGreaterThan(200);
  });

  it('renderStandaloneSvg produces valid SVG including connections + all element types', () => {
    const elements: CanvasElement[] = [
      { id: 'b', type: 'button', x: 0, y: 0, width: 40, height: 20, text: 'btn', borderColor: '#fff' },
      { id: 'n', type: 'input', x: 40, y: 0, width: 80, height: 20, placeholder: 'type…' },
      { id: 'n2', type: 'input', x: 40, y: 24, width: 80, height: 20, text: 'value' },
      { id: 'c', type: 'container', x: 0, y: 50, width: 120, height: 40, text: 'group' },
      { id: 'lb', type: 'label', x: 0, y: 100, width: 40, height: 20, text: 'Lbl' },
      { id: 'i', type: 'image', x: 0, y: 40, width: 40, height: 40, imageRef: 'k' },
      { id: 'ip', type: 'image', x: 40, y: 40, width: 40, height: 40 },
      { id: 't', type: 'text', x: 0, y: 80, width: 40, height: 20, text: '<hi>' },
      { id: 's', type: 'sticky-note', x: 0, y: 100, width: 40, height: 20, text: 'note' },
      { id: 'f', type: 'flow-node', x: 0, y: 120, width: 40, height: 20 }
    ];
    const svg = renderStandaloneSvg(elements, [
      { id: 'c1', fromId: 'b', toId: 'n', style: 'orthogonal' }
    ], { k: 'data:image/png;base64,abc' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('<image');
    expect(svg).toContain('&lt;hi&gt;');
    expect(svg).toContain('<path');
    expect(svg).toContain('type…');
  });

  it('snapToGrid no-ops for grid <=0', () => {
    expect(snapToGrid(10, -1)).toBe(10);
  });

  it('computeAlignmentGuides emits vertical guide when left edges align', () => {
    const moving = { id: 'm', type: 'button' as const, x: 100, y: 200, width: 40, height: 20 };
    const other = { id: 'o', type: 'button' as const, x: 100, y: 0, width: 40, height: 20 };
    const guides = computeAlignmentGuides(['m'], [moving, other]);
    expect(guides.some((g) => g.orientation === 'v' && g.coord === 100)).toBe(true);
  });

  it('computeAlignmentGuides emits horizontal guide when centers align', () => {
    const moving = { id: 'm', type: 'button' as const, x: 0, y: 50, width: 40, height: 20 };
    const other = { id: 'o', type: 'button' as const, x: 200, y: 50, width: 80, height: 20 };
    const guides = computeAlignmentGuides(['m'], [moving, other]);
    expect(guides.some((g) => g.orientation === 'h')).toBe(true);
  });

  it('computeAlignmentGuides respects threshold (no guides far apart)', () => {
    const moving = { id: 'm', type: 'button' as const, x: 100, y: 0, width: 40, height: 20 };
    const other = { id: 'o', type: 'button' as const, x: 300, y: 400, width: 40, height: 20 };
    expect(computeAlignmentGuides(['m'], [moving, other])).toHaveLength(0);
  });

  it('computeAlignmentGuides returns [] when no other elements', () => {
    const moving = { id: 'm', type: 'button' as const, x: 100, y: 0, width: 40, height: 20 };
    expect(computeAlignmentGuides(['m'], [moving])).toEqual([]);
  });
});
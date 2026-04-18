/// <reference lib="webworker" />
import { renderStandaloneSvg } from '../features/canvas/canvas-render';
import { CanvasElement, CanvasConnection } from '../core/models/models';

interface ExportMsg {
  type: 'EXPORT_SVG';
  payload: { elements: CanvasElement[]; connections: CanvasConnection[]; blobMap: Record<string, string> };
}

addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as ExportMsg;
  if (msg.type !== 'EXPORT_SVG') return;
  const svg = renderStandaloneSvg(msg.payload.elements, msg.payload.connections, msg.payload.blobMap);
  (postMessage as (m: unknown) => void)({ type: 'SVG_STRING', svg });
});

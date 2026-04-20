/// <reference lib="webworker" />

interface ExportPngMsg {
  type: 'EXPORT_PNG';
  payload: { svg: string; width?: number; height?: number };
}

addEventListener('message', async (ev: MessageEvent) => {
  const msg = ev.data as ExportPngMsg;
  if (msg.type !== 'EXPORT_PNG') return;
  try {
    if (typeof (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
      (postMessage as (m: unknown) => void)({ type: 'PNG_ERROR', error: 'OffscreenCanvas unsupported' });
      return;
    }
    const svgBlob = new Blob([msg.payload.svg], { type: 'image/svg+xml' });
    const bitmap = await createImageBitmap(svgBlob);
    const w = msg.payload.width ?? bitmap.width ?? 800;
    const h = msg.payload.height ?? bitmap.height ?? 600;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    const buffer = await pngBlob.arrayBuffer();
    (postMessage as (m: unknown, t?: Transferable[]) => void)(
      { type: 'PNG_BLOB', buffer, mimeType: 'image/png' },
      [buffer]
    );
  } catch (e) {
    (postMessage as (m: unknown) => void)({ type: 'PNG_ERROR', error: String(e) });
  }
});

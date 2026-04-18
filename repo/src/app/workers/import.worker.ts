/// <reference lib="webworker" />
import { validateImport } from '../features/canvas/import-export';

interface ImportMsg {
  type: 'IMPORT';
  payload: { raw: string; format: 'json' | 'csv'; existingIds: string[]; maxNodes: number; remainingCap: number };
}

addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as ImportMsg;
  if (msg.type !== 'IMPORT') return;
  const res = validateImport(msg.payload.raw, msg.payload.format, msg.payload.existingIds, msg.payload.maxNodes, msg.payload.remainingCap);
  (postMessage as (m: unknown) => void)({ type: 'IMPORT_RESULT', ...res });
});

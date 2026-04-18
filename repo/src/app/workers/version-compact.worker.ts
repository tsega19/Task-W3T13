/// <reference lib="webworker" />

interface VersionMeta { id: string; versionNumber: number }

interface CompactMsg {
  type: 'COMPACT';
  payload: { versions: VersionMeta[]; maxVersions: number };
}

addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as CompactMsg;
  if (msg.type !== 'COMPACT') return;
  const sorted = [...msg.payload.versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const deletions: string[] = [];
  while (sorted.length > msg.payload.maxVersions) {
    const v = sorted.shift();
    if (v) deletions.push(v.id);
  }
  for (const id of deletions) {
    (postMessage as (m: unknown) => void)({ type: 'DELETE_VERSION', id });
  }
  (postMessage as (m: unknown) => void)({ type: 'COMPACT_DONE', deleted: deletions.length });
});

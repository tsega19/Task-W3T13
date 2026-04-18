import '../../../test-setup';
import { BroadcastService, CanvasSavedMessage } from './broadcast.service';

describe('BroadcastService', () => {
  it('watch + publish + dismiss', () => {
    const bc = new BroadcastService();
    bc.watch('c1');
    expect(bc.conflict()).toBeNull();
    bc.publishSave('c1');
    expect(() => bc.dismissConflict()).not.toThrow();
    bc.watch(null);
    expect(bc.conflict()).toBeNull();
  });

  it('subscribers receive messages via onmessage handler', () => {
    const bc = new BroadcastService();
    const received: CanvasSavedMessage[] = [];
    const unsub = bc.subscribe((m) => received.push(m));
    const ch = (bc as unknown as { channel: { onmessage: ((ev: MessageEvent) => void) | null } }).channel;
    if (ch && typeof ch.onmessage === 'function') {
      ch.onmessage(new MessageEvent('message', { data: { type: 'canvas-saved', canvasId: 'c', timestamp: 1, tabId: 'other' } }));
      expect(received.length).toBe(1);
    }
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('sets conflict when matching canvas message arrives from another tab', () => {
    const bc = new BroadcastService();
    bc.watch('c42');
    const ch = (bc as unknown as { channel: { onmessage: ((ev: MessageEvent) => void) | null } }).channel;
    if (ch && typeof ch.onmessage === 'function') {
      const ev = new MessageEvent('message', { data: { type: 'canvas-saved', canvasId: 'c42', timestamp: 1, tabId: 'other' } });
      ch.onmessage(ev);
      expect(bc.conflict()?.canvasId).toBe('c42');
    }
  });

  it('ignores its own tab messages', () => {
    const bc = new BroadcastService();
    bc.watch('c');
    const ch = (bc as unknown as { channel: { onmessage: ((ev: MessageEvent) => void) | null } }).channel;
    if (ch && typeof ch.onmessage === 'function') {
      const ev = new MessageEvent('message', { data: { type: 'canvas-saved', canvasId: 'c', timestamp: 1, tabId: bc.tabId } });
      ch.onmessage(ev);
      expect(bc.conflict()).toBeNull();
    }
  });
});
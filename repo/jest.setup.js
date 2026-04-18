// Polyfills + browser API mocks. Loaded via `setupFiles` (before the test
// framework). Does NOT import jest-preset-angular/setup-jest — that lives in
// src/test-setup.ts and is imported by each spec file so it runs after
// describe/it/expect globals exist.

const nodeUtil = require('util');
if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = nodeUtil.TextEncoder;
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = nodeUtil.TextDecoder;

// Force writable+configurable so individual tests can swap crypto.subtle
// (jsdom installs crypto as read-only by default).
{
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
}

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));
}

// fake-indexeddb/auto sets globalThis.indexedDB and IDB* constructors.
require('fake-indexeddb/auto');
const { IDBFactory } = require('fake-indexeddb');
globalThis.__resetIndexedDB = () => {
  globalThis.indexedDB = new IDBFactory();
};

// Full BroadcastChannel shape so ts-jest's strict checks are happy when it
// transforms service code that constructs one via `new BroadcastChannel(...)`.
class BroadcastChannelMock {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.onmessageerror = null;
  }
  postMessage() { /* no-op */ }
  close() { /* no-op */ }
  addEventListener() { /* no-op */ }
  removeEventListener() { /* no-op */ }
  dispatchEvent() { return true; }
}
globalThis.BroadcastChannel = BroadcastChannelMock;

class WorkerMock {
  constructor() { this.onmessage = null; this.onerror = null; this.onmessageerror = null; }
  postMessage() { /* no-op */ }
  terminate() { /* no-op */ }
  addEventListener() { /* no-op */ }
  removeEventListener() { /* no-op */ }
  dispatchEvent() { return true; }
}
globalThis.Worker = WorkerMock;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock;

Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
});

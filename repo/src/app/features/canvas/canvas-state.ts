import {
  CanvasRecord,
  CanvasElement,
  CanvasConnection,
  CanvasGroup,
  CanvasViewState
} from '../../core/models/models';

export interface CanvasSnapshot {
  elements: CanvasElement[];
  connections: CanvasConnection[];
  groups: CanvasGroup[];
  viewState: CanvasViewState;
}

export function snapshotOf(canvas: CanvasRecord): CanvasSnapshot {
  return {
    elements: canvas.elements.map((e) => ({ ...e, tags: e.tags ? [...e.tags] : undefined })),
    connections: canvas.connections.map((c) => ({ ...c })),
    groups: canvas.groups.map((g) => ({ ...g, elementIds: [...g.elementIds] })),
    viewState: { ...canvas.viewState }
  };
}

export function applySnapshot(canvas: CanvasRecord, snap: CanvasSnapshot): void {
  canvas.elements = snap.elements.map((e) => ({ ...e }));
  canvas.connections = snap.connections.map((c) => ({ ...c }));
  canvas.groups = snap.groups.map((g) => ({ ...g, elementIds: [...g.elementIds] }));
  canvas.viewState = { ...snap.viewState };
}

export class UndoStack {
  private undoStack: CanvasSnapshot[] = [];
  private redoStack: CanvasSnapshot[] = [];

  constructor(private readonly limit: number) {}

  push(snap: CanvasSnapshot): void {
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  undo(current: CanvasSnapshot): CanvasSnapshot | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(current);
    if (this.redoStack.length > this.limit) this.redoStack.shift();
    return prev;
  }

  redo(current: CanvasSnapshot): CanvasSnapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    return next;
  }

  size(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }
}

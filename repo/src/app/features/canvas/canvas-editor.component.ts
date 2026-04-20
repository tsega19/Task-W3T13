import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasService } from './canvas.service';
import { AppConfigService } from '../../config/app-config.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoggerService } from '../../logging/logger.service';
import { DbService } from '../../core/services/db.service';
import { BroadcastService } from '../../core/services/broadcast.service';
import { ModalComponent } from '../../shared/components/modal.component';
import { ConflictBannerComponent } from '../../shared/components/conflict-banner.component';
import {
  CanvasConnection,
  CanvasElement,
  CanvasRecord,
  ELEMENT_TYPES,
  ElementType,
  VersionRecord
} from '../../core/models/models';
import { UndoStack, snapshotOf, applySnapshot, CanvasSnapshot } from './canvas-state';
import { AlignmentGuide, canvasBounds, computeAlignmentGuides, connectionPath, renderStandaloneSvg, snapToGrid } from './canvas-render';
import { uuid } from '../../core/services/crypto.util';
import { validateImport, ImportResult } from './import-export';

type Interaction = 'idle' | 'drag' | 'resize' | 'pan' | 'connect' | 'rubber';

@Component({
  selector: 'fc-canvas-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ConflictBannerComponent],
  template: `
    <fc-conflict-banner (reload)="onReloadLatest()" (keep)="onKeepMine()" />
    <div class="editor" *ngIf="canvas(); else loading">
      <aside class="toolbar">
        <h4>Elements</h4>
        <button type="button" *ngFor="let t of types" class="tool" (click)="addElementAtCenter(t)" [disabled]="!canEdit()" [attr.data-testid]="'tool-' + t">{{ t }}</button>
        <h4>Actions</h4>
        <button type="button" (click)="undo()" [disabled]="!undoStack.canUndo() || !canEdit()" data-testid="action-undo">Undo</button>
        <button type="button" (click)="redo()" [disabled]="!undoStack.canRedo() || !canEdit()" data-testid="action-redo">Redo</button>
        <button type="button" (click)="groupSelection()" [disabled]="selectionIds().length < 2 || !canEdit()" data-testid="action-group">Group</button>
        <button type="button" (click)="ungroupSelection()" [disabled]="!selectionHasGroup() || !canEdit()" data-testid="action-ungroup">Ungroup</button>
        <button type="button" (click)="duplicateSelection()" [disabled]="selectionIds().length === 0 || !canEdit()" data-testid="action-duplicate">Duplicate</button>
        <button type="button" class="danger" (click)="deleteSelection()" [disabled]="selectionIds().length === 0 || !canEdit()" data-testid="action-delete">Delete</button>
        <h4>Connect</h4>
        <label>
          Style
          <select [(ngModel)]="connectionStyle" data-testid="connection-style">
            <option value="straight">Straight</option>
            <option value="orthogonal">Orthogonal</option>
            <option value="curved">Curved</option>
          </select>
        </label>
        <button type="button" (click)="beginConnect()" [disabled]="selectionIds().length !== 1 || !canEdit()" data-testid="action-connect">Start connect</button>
        <h4>View</h4>
        <div class="row"><button type="button" (click)="zoomBy(1.1)">+</button><span>{{ zoomLabel() }}</span><button type="button" (click)="zoomBy(0.9)">-</button></div>
        <button type="button" (click)="resetView()">Fit</button>
        <h4>Data</h4>
        <button type="button" (click)="openImport()" *ngIf="perm.can('canvas.import')" data-testid="action-import">Import</button>
        <button type="button" (click)="exportJson()" *ngIf="perm.can('canvas.export')" data-testid="action-export-json">Export JSON</button>
        <button type="button" (click)="exportSvg()" *ngIf="perm.can('canvas.export')" data-testid="action-export-svg">Export SVG</button>
        <button type="button" (click)="exportPng()" *ngIf="perm.can('canvas.export')" data-testid="action-export-png">Export PNG</button>
        <button type="button" (click)="pickImage()" *ngIf="canEdit()" data-testid="action-image">Insert image</button>
        <input #fileInput type="file" hidden (change)="onFilePick($event)" accept=".json,.csv" />
        <input #imgInput type="file" hidden (change)="onImagePick($event)" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" />
        <h4>History</h4>
        <button type="button" (click)="openVersions()" data-testid="action-versions">Versions</button>
        <p class="muted small">Elements: {{ canvas()!.elements.length }} / {{ cap }}</p>
        <p class="warn small" *ngIf="nearCap()">Approaching element cap</p>
        <p class="muted small">Autosave: {{ lastSaveLabel() }}</p>
      </aside>

      <div class="surface-wrap" #surfaceWrap
        (wheel)="onWheel($event)"
        (mousedown)="onSurfaceMouseDown($event)"
        (mousemove)="onSurfaceMouseMove($event)"
        (mouseup)="onSurfaceMouseUp($event)"
        tabindex="0">
        <svg class="surface" [attr.viewBox]="viewBox()" width="100%" height="100%">
          <defs>
            <pattern id="grid" [attr.width]="gridSize()" [attr.height]="gridSize()" patternUnits="userSpaceOnUse">
              <path [attr.d]="'M ' + gridSize() + ' 0 L 0 0 0 ' + gridSize()" fill="none" stroke="#243147" stroke-width="1" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
          <rect class="bg" [attr.x]="-5000" [attr.y]="-5000" width="20000" height="20000" fill="url(#grid)" />
          <g *ngFor="let c of canvas()!.connections">
            <path [attr.d]="pathFor(c)" fill="none" [attr.stroke]="c.color || '#94a3b8'" [attr.stroke-width]="c.strokeWidth || 2" marker-end="url(#arrow)" [attr.data-testid]="'conn-' + c.id"/>
          </g>
          <g *ngFor="let e of sortedElements()"
             (mousedown)="onElementMouseDown($event, e)"
             [attr.data-testid]="'el-' + e.id">
            <ng-container [ngSwitch]="e.type">
              <image *ngSwitchCase="'image'" [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.width" [attr.height]="e.height" [attr.href]="getImageHref(e)" [attr.opacity]="e.opacity" />
              <rect *ngSwitchCase="'container'" [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.width" [attr.height]="e.height" [attr.rx]="e.borderRadius" [attr.ry]="e.borderRadius" [attr.fill]="e.backgroundColor" [attr.stroke]="e.borderColor" [attr.stroke-width]="e.borderWidth" stroke-dasharray="6 4" [attr.opacity]="e.opacity"/>
              <rect *ngSwitchDefault [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.width" [attr.height]="e.height" [attr.rx]="e.borderRadius" [attr.ry]="e.borderRadius" [attr.fill]="e.backgroundColor" [attr.stroke]="e.borderColor" [attr.stroke-width]="e.borderWidth" [attr.opacity]="e.opacity"/>
            </ng-container>
            <text *ngIf="e.type === 'container' && e.text" [attr.x]="e.x + 8" [attr.y]="e.y + (e.fontSize || 14) + 4" text-anchor="start" [attr.fill]="e.textColor" [attr.font-size]="e.fontSize">{{ e.text }}</text>
            <text *ngIf="e.type === 'label' && e.text" [attr.x]="e.x" [attr.y]="e.y + (e.fontSize || 14)" text-anchor="start" [attr.fill]="e.textColor" [attr.font-size]="e.fontSize">{{ e.text }}</text>
            <text *ngIf="e.type === 'input' && !e.text && e.placeholder" [attr.x]="e.x + 8" [attr.y]="e.y + e.height/2 + (e.fontSize || 14)/3" text-anchor="start" fill="#64748b" [attr.font-size]="e.fontSize" font-style="italic">{{ e.placeholder }}</text>
            <text *ngIf="e.type === 'input' && e.text" [attr.x]="e.x + 8" [attr.y]="e.y + e.height/2 + (e.fontSize || 14)/3" text-anchor="start" [attr.fill]="e.textColor" [attr.font-size]="e.fontSize">{{ e.text }}</text>
            <text *ngIf="e.text && e.type !== 'container' && e.type !== 'label' && e.type !== 'input'" [attr.x]="e.x + e.width/2" [attr.y]="e.y + e.height/2 + (e.fontSize || 14)/3" text-anchor="middle" [attr.fill]="e.textColor" [attr.font-size]="e.fontSize">{{ e.text }}</text>
            <rect *ngIf="isSelected(e.id)" class="sel" [attr.x]="e.x-2" [attr.y]="e.y-2" [attr.width]="e.width+4" [attr.height]="e.height+4" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 3"/>
            <rect *ngIf="isSelected(e.id) && canEdit() && !e.locked" class="handle" (mousedown)="onResizeMouseDown($event, e)" [attr.x]="e.x+e.width-6" [attr.y]="e.y+e.height-6" width="12" height="12" fill="#38bdf8" [attr.data-testid]="'handle-' + e.id" />
          </g>
          <rect *ngIf="rubber()" [attr.x]="rubber()!.x" [attr.y]="rubber()!.y" [attr.width]="rubber()!.w" [attr.height]="rubber()!.h" fill="rgba(56,189,248,0.15)" stroke="#38bdf8" stroke-dasharray="4 2"/>
          <g data-testid="alignment-guides" *ngIf="alignmentGuides().length > 0">
            <line *ngFor="let g of alignmentGuides(); let i = index"
                  [attr.x1]="g.orientation === 'v' ? g.coord : g.start"
                  [attr.y1]="g.orientation === 'v' ? g.start : g.coord"
                  [attr.x2]="g.orientation === 'v' ? g.coord : g.end"
                  [attr.y2]="g.orientation === 'v' ? g.end : g.coord"
                  stroke="#f472b6"
                  stroke-width="1"
                  stroke-dasharray="3 3"
                  [attr.data-testid]="'guide-' + i" />
          </g>
        </svg>
      </div>

      <aside class="inspector" *ngIf="primarySelected() as sel" data-testid="inspector">
        <h4>Inspector</h4>
        <label>Text<input [(ngModel)]="sel.text" (ngModelChange)="markDirty()" [disabled]="!canEdit()" data-testid="insp-text" /></label>
        <label *ngIf="sel.type === 'input'">Placeholder<input [(ngModel)]="sel.placeholder" (ngModelChange)="markDirty()" [disabled]="!canEdit()" data-testid="insp-placeholder" /></label>
        <label>X<input type="number" [(ngModel)]="sel.x" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label>Y<input type="number" [(ngModel)]="sel.y" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label>Width<input type="number" min="10" [(ngModel)]="sel.width" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label>Height<input type="number" min="10" [(ngModel)]="sel.height" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label>Fill<input type="color" [(ngModel)]="sel.backgroundColor" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label>Stroke<input type="color" [(ngModel)]="sel.borderColor" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label>Font size<input type="number" min="8" [(ngModel)]="sel.fontSize" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label>Opacity<input type="number" min="0" max="1" step="0.1" [(ngModel)]="sel.opacity" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /></label>
        <label><input type="checkbox" [(ngModel)]="sel.locked" (ngModelChange)="markDirty()" [disabled]="!canEdit()" /> Locked</label>
      </aside>
    </div>

    <fc-modal *ngIf="showCap()" [title]="'Element limit reached'" [dismissible]="false" data-testid="cap-modal">
      <p>This canvas has reached the hard limit of {{ cap }} elements. No new elements can be added until some are removed.</p>
      <div class="row">
        <button type="button" class="primary" (click)="showCap.set(false)" data-testid="cap-ok">OK</button>
      </div>
    </fc-modal>

    <fc-modal *ngIf="importResult() as r" [title]="'Import summary'" (backdropClose)="importResult.set(null)">
      <p>Total rows: {{ r.total }} · Imported: {{ r.imported.length }} · Skipped: {{ r.skipped.length }} · Renamed: {{ r.renamed.length }}</p>
      <ul class="scroll" *ngIf="r.skipped.length > 0"><li *ngFor="let s of r.skipped">Row {{ s.row }}: {{ s.reason }}</li></ul>
      <ul class="scroll" *ngIf="r.renamed.length > 0"><li *ngFor="let s of r.renamed">{{ s.original }} → {{ s.renamed }}</li></ul>
      <div class="row"><button type="button" class="primary" (click)="importResult.set(null)">Close</button></div>
    </fc-modal>

    <fc-modal *ngIf="showVersions()" [title]="'Version history'" (backdropClose)="showVersions.set(false)">
      <ul class="version-list">
        <li *ngFor="let v of versions()" [attr.data-testid]="'version-' + v.versionNumber">
          <strong>v{{ v.versionNumber }}</strong>
          <span class="muted">{{ formatDate(v.createdAt) }}</span>
          <span *ngIf="v.label" class="chip">{{ v.label }}</span>
          <button type="button" (click)="rollbackConfirm.set(v)" *ngIf="canEdit()" [attr.data-testid]="'version-rollback-' + v.versionNumber">Rollback</button>
        </li>
      </ul>
    </fc-modal>

    <fc-modal *ngIf="rollbackConfirm() as v" [title]="'Rollback to v' + v.versionNumber + '?'" (backdropClose)="rollbackConfirm.set(null)">
      <p>The current state will be saved as a new version first.</p>
      <div class="row">
        <button type="button" (click)="rollbackConfirm.set(null)">Cancel</button>
        <button type="button" class="primary" (click)="doRollback(v)" data-testid="rollback-confirm">Rollback</button>
      </div>
    </fc-modal>

    <ng-template #loading><div class="loading">Loading canvas…</div></ng-template>
  `,
  styles: [`
    :host { display: block; }
    .editor { display: grid; grid-template-columns: 200px 1fr 260px; height: calc(100vh - 54px); }
    .toolbar, .inspector { background: var(--bg-2); border-right: 1px solid var(--border); padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .inspector { border-right: none; border-left: 1px solid var(--border); }
    .toolbar h4, .inspector h4 { margin: 10px 0 4px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; }
    .tool { text-align: left; }
    .surface-wrap { position: relative; overflow: hidden; background: #0b1220; outline: none; cursor: grab; }
    .surface { display: block; width: 100%; height: 100%; }
    .sel { pointer-events: none; }
    .handle { cursor: nwse-resize; }
    .small { font-size: 11px; }
    .warn { color: var(--warning); }
    .scroll { max-height: 220px; overflow-y: auto; }
    .version-list { list-style: none; padding: 0; }
    .version-list li { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .chip { background: var(--surface-2); padding: 2px 6px; border-radius: 10px; font-size: 11px; }
    .loading { padding: 40px; text-align: center; color: var(--muted); }
    label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--muted); }
  `]
})
export class CanvasEditorComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly svc = inject(CanvasService);
  private readonly cfg = inject(AppConfigService);
  private readonly notif = inject(NotificationService);
  private readonly auth = inject(AuthService);
  readonly perm = inject(PermissionService);
  private readonly logger = inject(LoggerService);
  private readonly db = inject(DbService);
  private readonly bc = inject(BroadcastService);

  @ViewChild('surfaceWrap') surfaceWrap!: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imgInput') imgInput!: ElementRef<HTMLInputElement>;

  readonly types = ELEMENT_TYPES;
  readonly cap = this.cfg.get().canvas.elementCap;
  readonly undoStack = new UndoStack(this.cfg.get().canvas.undoLimit);

  canvas = signal<CanvasRecord | null>(null);
  selectionIds = signal<string[]>([]);
  dirty = signal<boolean>(false);
  lastSavedAt = signal<number>(0);
  lastVersionAt = signal<number>(0);
  showCap = signal<boolean>(false);
  importResult = signal<ImportResult | null>(null);
  showVersions = signal<boolean>(false);
  versions = signal<VersionRecord[]>([]);
  rollbackConfirm = signal<VersionRecord | null>(null);
  connectionStyle: 'straight' | 'orthogonal' | 'curved' = 'orthogonal';
  interaction: Interaction = 'idle';
  private dragStart: { x: number; y: number; elementStart: Map<string, { x: number; y: number }> } | null = null;
  private resizeStart: { x: number; y: number; w: number; h: number; id: string } | null = null;
  private panStart: { x: number; y: number; panX: number; panY: number } | null = null;
  private rubberStart: { x: number; y: number } | null = null;
  rubber = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  alignmentGuides = signal<AlignmentGuide[]>([]);
  private connectFrom: string | null = null;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private blobHrefs: Record<string, string> = {};

  primarySelected = computed<CanvasElement | null>(() => {
    const ids = this.selectionIds();
    const c = this.canvas();
    if (!c || ids.length === 0) return null;
    return c.elements.find((e) => e.id === ids[0]) ?? null;
  });

  sortedElements = computed(() => {
    const c = this.canvas();
    if (!c) return [];
    return [...c.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  });

  nearCap = computed(() => {
    const c = this.canvas();
    if (!c) return false;
    const pct = (c.elements.length / this.cap) * 100;
    return pct >= this.cfg.get().diagnostics.capWarnPct;
  });

  constructor() {
    effect(() => {
      const c = this.canvas();
      if (!c) return;
      void this.refreshBlobHrefs(c);
    });
  }

  async ngOnInit(): Promise<void> {
    const canvasId = this.route.snapshot.paramMap.get('canvasId');
    if (!canvasId) {
      await this.router.navigate(['/projects']);
      return;
    }
    const c = await this.svc.get(canvasId);
    if (!c) {
      this.notif.error('Canvas not found.');
      await this.router.navigate(['/projects']);
      return;
    }
    this.canvas.set(c);
    this.undoStack.clear();
    this.bc.watch(c.id);
    this.startAutosave();
  }

  ngOnDestroy(): void {
    if (this.autosaveTimer) clearInterval(this.autosaveTimer);
    this.bc.watch(null);
    for (const href of Object.values(this.blobHrefs)) URL.revokeObjectURL(href);
    this.blobHrefs = {};
  }

  canEdit(): boolean {
    return this.perm.can('canvas.edit');
  }

  viewBox(): string {
    const c = this.canvas();
    if (!c) return '0 0 1000 800';
    const wrap = this.surfaceWrap?.nativeElement;
    const w = wrap?.clientWidth ?? 1000;
    const h = wrap?.clientHeight ?? 800;
    const zoom = c.viewState.zoom || 1;
    return `${c.viewState.panX} ${c.viewState.panY} ${w / zoom} ${h / zoom}`;
  }

  gridSize(): number {
    return this.canvas()?.viewState.gridSize ?? 20;
  }

  zoomLabel(): string {
    return `${Math.round((this.canvas()?.viewState.zoom ?? 1) * 100)}%`;
  }

  lastSaveLabel(): string {
    const t = this.lastSavedAt();
    if (!t) return 'not yet';
    const s = Math.floor((Date.now() - t) / 1000);
    return `${s}s ago`;
  }

  formatDate(ms: number): string {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  }

  isSelected(id: string): boolean {
    return this.selectionIds().includes(id);
  }

  selectionHasGroup(): boolean {
    const c = this.canvas();
    if (!c) return false;
    const ids = new Set(this.selectionIds());
    return c.elements.some((e) => ids.has(e.id) && e.groupId);
  }

  pathFor(c: CanvasConnection): string {
    const canvas = this.canvas();
    if (!canvas) return '';
    const from = canvas.elements.find((e) => e.id === c.fromId);
    const to = canvas.elements.find((e) => e.id === c.toId);
    if (!from || !to) return '';
    return connectionPath(from, to, c);
  }

  getImageHref(el: CanvasElement): string | null {
    if (!el.imageRef) return null;
    return this.blobHrefs[el.imageRef] ?? null;
  }

  private async refreshBlobHrefs(c: CanvasRecord): Promise<void> {
    const needed = new Set<string>();
    for (const e of c.elements) if (e.imageRef) needed.add(e.imageRef);
    for (const key of Object.keys(this.blobHrefs)) {
      if (!needed.has(key)) {
        URL.revokeObjectURL(this.blobHrefs[key]);
        delete this.blobHrefs[key];
      }
    }
    for (const key of needed) {
      if (this.blobHrefs[key]) continue;
      const rec = await this.db.blobs.get(key);
      if (rec) {
        const blob = new Blob([rec.data], { type: rec.mimeType });
        this.blobHrefs[key] = URL.createObjectURL(blob);
      }
    }
  }

  pushUndo(): void {
    const c = this.canvas();
    if (!c) return;
    this.undoStack.push(snapshotOf(c));
  }

  markDirty(): void {
    this.dirty.set(true);
    const c = this.canvas();
    if (c) this.canvas.set({ ...c });
  }

  addElementAtCenter(type: ElementType): void {
    const c = this.canvas();
    if (!c || !this.canEdit()) return;
    this.pushUndo();
    const el = this.svc.createElement(type, 200, 200);
    const res = this.svc.tryAddElement(c, el);
    if (!res.ok) {
      this.showCap.set(true);
      this.undoStack.undo(snapshotOf(c));
      return;
    }
    this.selectionIds.set([res.element!.id]);
    this.canvas.set({ ...c });
    this.markDirty();
  }

  deleteSelection(): void {
    const c = this.canvas();
    if (!c || !this.canEdit() || this.selectionIds().length === 0) return;
    this.pushUndo();
    this.svc.deleteElements(c, this.selectionIds());
    this.selectionIds.set([]);
    this.canvas.set({ ...c });
    this.markDirty();
  }

  duplicateSelection(): void {
    const c = this.canvas();
    if (!c || !this.canEdit()) return;
    this.pushUndo();
    const newIds: string[] = [];
    const remaining = this.svc.remainingCapacity(c);
    const toCopy = c.elements.filter((e) => this.selectionIds().includes(e.id)).slice(0, remaining);
    if (toCopy.length === 0) { this.showCap.set(true); return; }
    for (const e of toCopy) {
      const copy: CanvasElement = { ...e, id: uuid(), x: e.x + 20, y: e.y + 20 };
      c.elements.push(copy);
      newIds.push(copy.id);
    }
    this.selectionIds.set(newIds);
    this.canvas.set({ ...c });
    this.markDirty();
  }

  groupSelection(): void {
    const c = this.canvas();
    if (!c || !this.canEdit()) return;
    const ids = this.selectionIds();
    if (ids.length < 2) return;
    this.pushUndo();
    const groupId = uuid();
    c.groups.push({ id: groupId, name: 'Group', elementIds: [...ids] });
    for (const e of c.elements) {
      if (ids.includes(e.id)) e.groupId = groupId;
    }
    this.canvas.set({ ...c });
    this.markDirty();
  }

  ungroupSelection(): void {
    const c = this.canvas();
    if (!c || !this.canEdit()) return;
    this.pushUndo();
    const ids = new Set(this.selectionIds());
    const groupIds = new Set<string>();
    for (const e of c.elements) if (ids.has(e.id) && e.groupId) { groupIds.add(e.groupId); e.groupId = null; }
    c.groups = c.groups.filter((g) => !groupIds.has(g.id));
    this.canvas.set({ ...c });
    this.markDirty();
  }

  undo(): void {
    const c = this.canvas();
    if (!c) return;
    const prev = this.undoStack.undo(snapshotOf(c));
    if (!prev) return;
    applySnapshot(c, prev);
    this.canvas.set({ ...c });
    this.markDirty();
  }

  redo(): void {
    const c = this.canvas();
    if (!c) return;
    const next = this.undoStack.redo(snapshotOf(c));
    if (!next) return;
    applySnapshot(c, next);
    this.canvas.set({ ...c });
    this.markDirty();
  }

  beginConnect(): void {
    const ids = this.selectionIds();
    if (ids.length !== 1) return;
    this.connectFrom = ids[0];
    this.interaction = 'connect';
    this.notif.info('Click a target element to connect.');
  }

  zoomBy(factor: number): void {
    const c = this.canvas();
    if (!c) return;
    const next = Math.min(4, Math.max(0.1, (c.viewState.zoom || 1) * factor));
    c.viewState.zoom = next;
    this.canvas.set({ ...c });
  }

  resetView(): void {
    const c = this.canvas();
    if (!c) return;
    const b = canvasBounds(c.elements);
    c.viewState.panX = b.x;
    c.viewState.panY = b.y;
    c.viewState.zoom = 1;
    this.canvas.set({ ...c });
  }

  onWheel(ev: WheelEvent): void {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    this.zoomBy(ev.deltaY > 0 ? 0.9 : 1.1);
  }

  private clientToSvg(ev: MouseEvent): { x: number; y: number } {
    const c = this.canvas();
    const wrap = this.surfaceWrap?.nativeElement;
    if (!c || !wrap) return { x: 0, y: 0 };
    const rect = wrap.getBoundingClientRect();
    const sx = (ev.clientX - rect.left) / (c.viewState.zoom || 1) + c.viewState.panX;
    const sy = (ev.clientY - rect.top) / (c.viewState.zoom || 1) + c.viewState.panY;
    return { x: sx, y: sy };
  }

  onSurfaceMouseDown(ev: MouseEvent): void {
    const c = this.canvas();
    if (!c) return;
    if (ev.button !== 0) return;
    const target = ev.target as SVGElement;
    const isSurface = target.tagName === 'svg' || target.classList?.contains('bg');
    if (!isSurface) return;
    if (ev.getModifierState('Space')) {
      this.interaction = 'pan';
      this.panStart = { x: ev.clientX, y: ev.clientY, panX: c.viewState.panX, panY: c.viewState.panY };
      return;
    }
    const p = this.clientToSvg(ev);
    this.interaction = 'rubber';
    this.rubberStart = p;
    this.rubber.set({ x: p.x, y: p.y, w: 0, h: 0 });
    if (!ev.shiftKey) this.selectionIds.set([]);
  }

  onElementMouseDown(ev: MouseEvent, el: CanvasElement): void {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    const c = this.canvas();
    if (!c) return;
    if (this.interaction === 'connect' && this.connectFrom && this.connectFrom !== el.id) {
      this.pushUndo();
      const conn: CanvasConnection = {
        id: uuid(),
        fromId: this.connectFrom,
        toId: el.id,
        style: this.connectionStyle,
        color: '#94a3b8',
        strokeWidth: 2,
        arrowEnd: true
      };
      c.connections.push(conn);
      this.canvas.set({ ...c });
      this.markDirty();
      this.connectFrom = null;
      this.interaction = 'idle';
      return;
    }
    if (ev.shiftKey) {
      const set = new Set(this.selectionIds());
      if (set.has(el.id)) set.delete(el.id); else set.add(el.id);
      this.selectionIds.set(Array.from(set));
    } else if (!this.selectionIds().includes(el.id)) {
      this.selectionIds.set([el.id]);
    }
    if (!this.canEdit() || el.locked) return;
    const p = this.clientToSvg(ev);
    const elementStart = new Map<string, { x: number; y: number }>();
    for (const id of this.selectionIds()) {
      const e = c.elements.find((x) => x.id === id);
      if (e) elementStart.set(id, { x: e.x, y: e.y });
    }
    this.dragStart = { x: p.x, y: p.y, elementStart };
    this.pushUndo();
    this.interaction = 'drag';
  }

  onResizeMouseDown(ev: MouseEvent, el: CanvasElement): void {
    ev.stopPropagation();
    if (!this.canEdit() || el.locked) return;
    const p = this.clientToSvg(ev);
    this.resizeStart = { x: p.x, y: p.y, w: el.width, h: el.height, id: el.id };
    this.pushUndo();
    this.interaction = 'resize';
  }

  onSurfaceMouseMove(ev: MouseEvent): void {
    const c = this.canvas();
    if (!c) return;
    if (this.interaction === 'pan' && this.panStart) {
      const zoom = c.viewState.zoom || 1;
      c.viewState.panX = this.panStart.panX - (ev.clientX - this.panStart.x) / zoom;
      c.viewState.panY = this.panStart.panY - (ev.clientY - this.panStart.y) / zoom;
      this.canvas.set({ ...c });
      return;
    }
    const p = this.clientToSvg(ev);
    if (this.interaction === 'rubber' && this.rubberStart) {
      const x = Math.min(this.rubberStart.x, p.x);
      const y = Math.min(this.rubberStart.y, p.y);
      const w = Math.abs(p.x - this.rubberStart.x);
      const h = Math.abs(p.y - this.rubberStart.y);
      this.rubber.set({ x, y, w, h });
      return;
    }
    if (this.interaction === 'drag' && this.dragStart) {
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      const grid = c.viewState.gridSize;
      const movingIds = new Set<string>();
      for (const [id, start] of this.dragStart.elementStart) {
        const e = c.elements.find((x) => x.id === id);
        if (!e) continue;
        e.x = snapToGrid(start.x + dx, grid);
        e.y = snapToGrid(start.y + dy, grid);
        movingIds.add(id);
      }
      this.alignmentGuides.set(computeAlignmentGuides(movingIds, c.elements));
      this.canvas.set({ ...c });
      this.markDirty();
      return;
    }
    if (this.interaction === 'resize' && this.resizeStart) {
      const e = c.elements.find((x) => x.id === this.resizeStart!.id);
      if (!e) return;
      e.width = Math.max(10, this.resizeStart.w + (p.x - this.resizeStart.x));
      e.height = Math.max(10, this.resizeStart.h + (p.y - this.resizeStart.y));
      this.canvas.set({ ...c });
      this.markDirty();
    }
  }

  onSurfaceMouseUp(ev: MouseEvent): void {
    const c = this.canvas();
    if (!c) return;
    if (this.interaction === 'rubber' && this.rubber()) {
      const r = this.rubber()!;
      const ids = c.elements.filter((e) => e.x >= r.x && e.x + e.width <= r.x + r.w && e.y >= r.y && e.y + e.height <= r.y + r.h).map((e) => e.id);
      if (ids.length > 0) this.selectionIds.set(ids);
    }
    this.rubber.set(null);
    this.rubberStart = null;
    this.panStart = null;
    this.dragStart = null;
    this.resizeStart = null;
    this.alignmentGuides.set([]);
    if (this.interaction !== 'connect') this.interaction = 'idle';
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    const c = this.canvas();
    if (!c) return;
    const tag = (ev.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (ev.key === 'Escape' && this.interaction === 'connect') {
      this.connectFrom = null;
      this.interaction = 'idle';
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) { ev.preventDefault(); this.undo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); this.redo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') { ev.preventDefault(); this.selectionIds.set(c.elements.map((e) => e.id)); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); this.duplicateSelection(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'g' && !ev.shiftKey) { ev.preventDefault(); this.groupSelection(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'g') { ev.preventDefault(); this.ungroupSelection(); return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); this.deleteSelection(); return; }
  }

  private startAutosave(): void {
    if (this.autosaveTimer) clearInterval(this.autosaveTimer);
    const ms = this.cfg.get().canvas.autosaveMs;
    this.autosaveTimer = setInterval(() => { void this.autosaveTick(); }, ms);
  }

  private async autosaveTick(): Promise<void> {
    if (!this.dirty()) return;
    const c = this.canvas();
    if (!c) return;
    try {
      await this.svc.save(c);
      this.dirty.set(false);
      this.lastSavedAt.set(Date.now());
      const gap = this.cfg.get().canvas.versionGapMs;
      if (Date.now() - this.lastVersionAt() > gap) {
        await this.svc.createVersion(c, undefined, (versions, max) => this.planCompactionViaWorker(versions, max));
        this.lastVersionAt.set(Date.now());
      }
    } catch (e) {
      this.logger.error('canvas', 'autosave', 'save failed', { error: String(e) });
      this.notif.error('Autosave failed — check storage quota.');
    }
  }

  openImport(): void { this.fileInput.nativeElement.value = ''; this.fileInput.nativeElement.click(); }
  pickImage(): void { this.imgInput.nativeElement.value = ''; this.imgInput.nativeElement.click(); }

  async onFilePick(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const format: 'json' | 'csv' = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
    const c = this.canvas();
    if (!c) return;
    const existing = c.elements.map((e) => e.id);
    const maxNodes = this.cfg.get().importExport.maxNodes;
    const remainingCap = this.svc.remainingCapacity(c);
    let result: ImportResult;
    try {
      const worker = new Worker(new URL('../../workers/import.worker', import.meta.url), { type: 'module' });
      result = await new Promise<ImportResult>((resolve, reject) => {
        worker.onmessage = (ev2: MessageEvent) => {
          const data = ev2.data as { type: string } & ImportResult;
          if (data.type === 'IMPORT_RESULT') resolve({ total: data.total, imported: data.imported, skipped: data.skipped, renamed: data.renamed });
        };
        worker.onerror = (err) => reject(err);
        worker.postMessage({ type: 'IMPORT', payload: { raw: text, format, existingIds: existing, maxNodes, remainingCap } });
      });
      worker.terminate();
    } catch {
      result = validateImport(text, format, existing, maxNodes, remainingCap);
    }
    if (result.imported.length > 0) {
      this.pushUndo();
      c.elements.push(...result.imported);
      this.canvas.set({ ...c });
      this.markDirty();
    }
    this.importResult.set(result);
    const summary = `Total: ${result.total}, imported: ${result.imported.length}, skipped: ${result.skipped.length}, renamed: ${result.renamed.length}`;
    const sections: string[] = [summary];
    if (result.renamed.length > 0) {
      const renames = result.renamed.map((r) => `${r.original} → ${r.renamed}`).join('; ');
      sections.push(`Renames: ${renames}`);
    }
    if (result.skipped.length > 0) {
      const skipped = result.skipped.map((s) => `row ${s.row}: ${s.reason}`).join('; ');
      sections.push(`Skipped: ${skipped}`);
    }
    this.notif.log('info', 'Import complete', sections.join('. '));
  }

  async onImagePick(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowed = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
    if (!allowed.has(file.type)) {
      this.notif.error('Unsupported image format.');
      return;
    }
    if (file.size > this.cfg.get().importExport.imageMaxBytes) {
      this.notif.error('Image exceeds 50 MB limit.');
      return;
    }
    const c = this.canvas();
    if (!c) return;
    const buf = await file.arrayBuffer();
    const key = uuid();
    await this.db.blobs.put({ key, name: file.name, mimeType: file.type, sizeBytes: file.size, data: buf, createdAt: Date.now() });
    this.pushUndo();
    const el = this.svc.createElement('image', 200, 200);
    el.imageRef = key;
    const res = this.svc.tryAddElement(c, el);
    if (!res.ok) { this.showCap.set(true); return; }
    this.canvas.set({ ...c });
    this.markDirty();
  }

  async exportJson(): Promise<void> {
    const c = this.canvas();
    if (!c) return;
    const payload = { name: c.name, elements: c.elements, connections: c.connections, groups: c.groups };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const filename = `${c.name}.json`;
    await this.persistExportBlob(blob, filename);
    this.downloadBlob(blob, filename);
  }

  async exportSvg(): Promise<void> {
    const c = this.canvas();
    if (!c) return;
    const blobMap: Record<string, string> = {};
    for (const e of c.elements) {
      if (e.imageRef) {
        const rec = await this.db.blobs.get(e.imageRef);
        if (rec) blobMap[e.imageRef] = await blobToDataUrl(new Blob([rec.data], { type: rec.mimeType }));
      }
    }
    const worker = new Worker(new URL('../../workers/export-svg.worker', import.meta.url), { type: 'module' });
    const p = new Promise<string>((resolve) => {
      worker.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { type: string; svg?: string };
        if (data.type === 'SVG_STRING' && data.svg) resolve(data.svg);
      };
    });
    worker.postMessage({ type: 'EXPORT_SVG', payload: { elements: c.elements, connections: c.connections, blobMap } });
    const svg = await p.catch(() => renderStandaloneSvg(c.elements, c.connections, blobMap));
    worker.terminate();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
    const filename = `${c.name}.svg`;
    await this.persistExportBlob(svgBlob, filename);
    this.downloadBlob(svgBlob, filename);
  }

  async exportPng(): Promise<void> {
    const c = this.canvas();
    if (!c) return;
    const blobMap: Record<string, string> = {};
    for (const e of c.elements) {
      if (e.imageRef) {
        const rec = await this.db.blobs.get(e.imageRef);
        if (rec) blobMap[e.imageRef] = await blobToDataUrl(new Blob([rec.data], { type: rec.mimeType }));
      }
    }
    const svg = renderStandaloneSvg(c.elements, c.connections, blobMap);
    try {
      const pngBlob = await this.renderPngViaWorker(svg);
      const filename = `${c.name}.png`;
      await this.persistExportBlob(pngBlob, filename);
      this.downloadBlob(pngBlob, filename);
    } catch (e) {
      this.logger.error('canvas', 'export-png', 'failed', { error: String(e) });
      this.notif.error('PNG export failed.');
    }
  }

  /**
   * Dispatch version-compaction planning to `version-compact.worker` so the
   * sort/while-prune work stays off the main thread. Handed to
   * `CanvasService.createVersion` as a compactor callback. Falls back to the
   * service's inline plan if the worker cannot be spawned or stays silent.
   */
  private planCompactionViaWorker(versions: VersionRecord[], maxVersions: number): Promise<string[]> {
    const payload = {
      versions: versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber })),
      maxVersions
    };
    return new Promise<string[]>((resolve) => {
      let worker: Worker | null = null;
      try {
        worker = new Worker(new URL('../../workers/version-compact.worker', import.meta.url), { type: 'module' });
      } catch {
        resolve(this.svc.planVersionCompactionInline(payload.versions, maxVersions));
        return;
      }
      const w = worker;
      let settled = false;
      const fallback = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { w.terminate(); } catch { /* noop */ }
        resolve(this.svc.planVersionCompactionInline(payload.versions, maxVersions));
      };
      const timer = setTimeout(fallback, 250);
      w.onmessage = (ev: MessageEvent) => {
        if (settled) return;
        const data = ev.data as { type: string; deletions?: string[] };
        if (data.type === 'COMPACT_PLAN') {
          settled = true;
          clearTimeout(timer);
          try { w.terminate(); } catch { /* noop */ }
          resolve(data.deletions ?? []);
        }
      };
      w.onerror = fallback;
      w.postMessage({ type: 'COMPACT', payload });
    });
  }

  private renderPngViaWorker(svg: string): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      let worker: Worker | null = null;
      try {
        worker = new Worker(new URL('../../workers/export-png.worker', import.meta.url), { type: 'module' });
      } catch {
        svgToPngBlob(svg).then(resolve).catch(reject);
        return;
      }
      const w = worker;
      let settled = false;
      const finish = (cb: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { w.terminate(); } catch { /* noop */ }
        cb();
      };
      // Safety net: if the worker never responds (mocked in tests, or a
      // missing OffscreenCanvas/createImageBitmap path), fall back to
      // main-thread rasterization so PNG export still completes.
      const timer = setTimeout(() => finish(() => { svgToPngBlob(svg).then(resolve).catch(reject); }), 4000);
      w.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { type: string; buffer?: ArrayBuffer; mimeType?: string };
        if (data.type === 'PNG_BLOB' && data.buffer) {
          finish(() => resolve(new Blob([data.buffer!], { type: data.mimeType || 'image/png' })));
        } else if (data.type === 'PNG_ERROR') {
          finish(() => { svgToPngBlob(svg).then(resolve).catch(reject); });
        }
      };
      w.onerror = () => finish(() => { svgToPngBlob(svg).then(resolve).catch(reject); });
      w.postMessage({ type: 'EXPORT_PNG', payload: { svg } });
    });
  }

  private async persistExportBlob(blob: Blob, filename: string): Promise<void> {
    try {
      const buf = await blob.arrayBuffer();
      await this.db.blobs.put({
        key: uuid(),
        name: filename,
        mimeType: blob.type || 'application/octet-stream',
        sizeBytes: blob.size,
        data: buf,
        createdAt: Date.now()
      });
    } catch (e) {
      this.logger.warn('canvas', 'export-persist', 'failed to persist export blob', { error: String(e), filename });
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async openVersions(): Promise<void> {
    const c = this.canvas();
    if (!c) return;
    this.versions.set(await this.svc.listVersions(c.id));
    this.showVersions.set(true);
  }

  async doRollback(v: VersionRecord): Promise<void> {
    const c = this.canvas();
    if (!c) return;
    try {
      const next = await this.svc.rollback(c, v.id);
      this.canvas.set({ ...next });
      this.undoStack.clear();
      this.rollbackConfirm.set(null);
      this.showVersions.set(false);
      this.notif.success('Rollback complete.');
    } catch (e) {
      this.notif.error((e as Error).message);
    }
  }

  async onReloadLatest(): Promise<void> {
    const id = this.canvas()?.id;
    if (!id) return;
    const fresh = await this.svc.get(id);
    if (fresh) {
      this.canvas.set(fresh);
      this.undoStack.clear();
      this.dirty.set(false);
    }
    this.bc.dismissConflict();
  }

  onKeepMine(): void {
    this.markDirty();
    this.bc.dismissConflict();
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const loaded = new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
    img.src = url;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 800;
    canvas.height = img.naturalHeight || 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D context');
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

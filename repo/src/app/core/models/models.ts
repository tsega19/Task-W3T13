export type UserRole = 'admin' | 'editor' | 'reviewer';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: number;
  updatedAt: number;
  lastLogin?: number;
  failedAttempts: number;
  cooldownUntil?: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  tags: string[];
  pinned: boolean;
  featured: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  canvasCount: number;
}

export const ELEMENT_TYPES = [
  'text',
  'button',
  'input',
  'image',
  'container',
  'label',
  'flow-node',
  'sticky-note'
] as const;
export type ElementType = typeof ELEMENT_TYPES[number];

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  imageRef?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  textColor?: string;
  fontSize?: number;
  opacity?: number;
  locked?: boolean;
  groupId?: string | null;
  zIndex?: number;
  shape?: string;
  noteColor?: string;
  label?: string;
  tags?: string[];
  placeholder?: string;
}

export type ConnectionStyle = 'straight' | 'orthogonal' | 'curved';

export interface CanvasConnection {
  id: string;
  fromId: string;
  toId: string;
  fromPort?: 'n' | 's' | 'e' | 'w';
  toPort?: 'n' | 's' | 'e' | 'w';
  style: ConnectionStyle;
  color?: string;
  strokeWidth?: number;
  label?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
}

export interface CanvasGroup {
  id: string;
  name: string;
  elementIds: string[];
}

export interface CanvasViewState {
  zoom: number;
  panX: number;
  panY: number;
  gridSize: number;
}

export interface CanvasRecord {
  id: string;
  projectId: string;
  name: string;
  description: string;
  elements: CanvasElement[];
  connections: CanvasConnection[];
  groups: CanvasGroup[];
  viewState: CanvasViewState;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  tags: string[];
}

export interface VersionRecord {
  id: string;
  canvasId: string;
  projectId: string;
  versionNumber: number;
  snapshotJson: string;
  createdAt: number;
  createdBy: string;
  label?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  userId: string;
  username: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  durationMs?: number;
}

export type ReviewStatus = 'open' | 'resolved' | 'rejected';
export interface ReviewRecord {
  id: string;
  canvasId: string;
  projectId: string;
  content: string;
  status: ReviewStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus = 'open' | 'in-progress' | 'done';
export interface TicketRecord {
  id: string;
  reviewId: string;
  canvasId: string;
  projectId: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  attachmentIds: string[];
}

export interface BlobRecord {
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  data: ArrayBuffer;
  createdAt: number;
}

export interface SessionInfo {
  userId: string;
  username: string;
  role: UserRole;
  issuedAt: number;
  lastActivity: number;
}

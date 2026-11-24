export const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_DOWNLOAD_URL_ISSUED',
  'DOCUMENT_DELETE',
  'DOCUMENT_ACCESS_DENIED',
  'DOCUMENT_DELETE_DENIED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_OUTCOMES = [
  'SUCCESS',
  'FAILURE',
  'DENIED',
] as const;

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_RESOURCE_TYPES = [
  'USER',
  'SESSION',
  'DOCUMENT',
  'AUTHENTICATION',
] as const;

export type AuditResourceType =
  (typeof AUDIT_RESOURCE_TYPES)[number];

export interface AuditEvent {
  event_id: string;
  actor_id?: string;
  actor_roles: string[];
  action: AuditAction;
  resource_type: AuditResourceType;
  resource_id?: string;
  outcome: AuditOutcome;
  timestamp: number;
  details?: {
    content_type?: string;
    file_size?: number;
    reason_code?: string;
  };
}

export type CreateAuditEventInput = Omit<
  AuditEvent,
  'event_id' | 'timestamp'
> & {
  event_id?: never;
  timestamp?: never;
};


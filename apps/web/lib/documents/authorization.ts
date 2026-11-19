
import 'server-only';

import type { AuthenticatedUser } from '../auth/require-auth';
import type { UserRole } from '../auth/require-role';
import { roleHasPermission } from '../auth/permissions';
import type { DocumentRecord, DocumentAction } from './types';

const USER_ROLES: readonly UserRole[] = [
  'Admin',
  'Analyst',
  'Employee',
];

function isUserRole(group: string): group is UserRole {
  return USER_ROLES.includes(group as UserRole);
}

function getUserRoles(user: AuthenticatedUser): UserRole[] {
  return user.groups.filter(isUserRole);
}

/**
 * Determines whether a user can perform an action on a document.
 *
 * Admin:
 *   Read and delete any document.
 *
 * Analyst:
 *   Read any document, delete own documents.
 *
 * Employee:
 *   Read and delete own documents.
 *
 * Multiple Cognito groups are treated as a union of permissions.
 */
export function canAccessDocument(
  user: AuthenticatedUser,
  document: DocumentRecord,
  action: DocumentAction,
): boolean {
  const roles = getUserRoles(user);

  // Users without a recognised application role get no access.
  if (roles.length === 0) {
    return false;
  }

  const isOwner = document.owner_id === user.sub;

  if (action === 'read') {
    return roles.some(
      (role) =>
        roleHasPermission(role, 'documents:read') &&
        (role === 'Admin' || role === 'Analyst' || isOwner),
    );
  }

  if (action === 'delete') {
    return roles.some(
      (role) =>
        role === 'Admin' ||
        ((role === 'Analyst' || role === 'Employee') && isOwner),
    );
  }

  return false;
}

/**
 * Checks whether a user is allowed to upload documents.
 */
export function canUploadDocuments(
  user: AuthenticatedUser,
): boolean {
  return getUserRoles(user).some((role) =>
    roleHasPermission(role, 'documents:upload'),
  );
}

/**
 * Use the same error for a missing document and an inaccessible document.
 * This prevents users from discovering the existence of other users' files.
 */
export class DocumentNotFoundError extends Error {
  constructor() {
    super('Document not found.');
    this.name = 'DocumentNotFoundError';
  }
}

export function assertDocumentAccess(
  user: AuthenticatedUser,
  document: DocumentRecord | undefined,
  action: DocumentAction,
): asserts document is DocumentRecord {
  if (!document || !canAccessDocument(user, document, action)) {
    throw new DocumentNotFoundError();
  }
}

/**
 * Determines whether a user can list documents belonging to everyone.
 *
 * Admin and Analyst can list all documents.
 * Employee can only list documents they own.
 */
export function canListAllDocuments(
  user: AuthenticatedUser,
): boolean {
  return getUserRoles(user).some(
    (role) => role === 'Admin' || role === 'Analyst',
  );
}

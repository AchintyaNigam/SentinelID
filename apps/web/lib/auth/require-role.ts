
import 'server-only';

import {
  requireAuth,
  UnauthenticatedError,
  type AuthenticatedUser,
} from './require-auth';

export const USER_ROLES = ['Admin', 'Analyst', 'Employee'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<AuthenticatedUser> {
  if (allowedRoles.length === 0) {
    throw new Error('At least one role must be specified.');
  }

  const user = await requireAuth();

  const hasRequiredRole = user.groups.some((group) =>
    allowedRoles.includes(group as UserRole),
  );

  if (!hasRequiredRole) {
    throw new ForbiddenError();
  }

  return user;
}


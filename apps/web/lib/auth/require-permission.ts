
import 'server-only';

import {
  requireAuth,
  type AuthenticatedUser,
} from './require-auth';

import {
  ForbiddenError,
  USER_ROLES,
  type UserRole,
} from './require-role';

import {
  roleHasPermission,
  type Permission,
} from './permissions';

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export async function requirePermission(
  permission: Permission,
): Promise<AuthenticatedUser> {
  const user = await requireAuth();

  const hasPermission = user.groups.some((group) => {
    if (!isUserRole(group)) {
      return false;
    }

    return roleHasPermission(group, permission);
  });

  if (!hasPermission) {
    throw new ForbiddenError(
      `You do not have permission to perform: ${permission}.`,
    );
  }

  return user;
}


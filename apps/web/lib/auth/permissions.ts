import type { UserRole } from './require-role';

export const PERMISSIONS = [
  'users:read',
  'users:manage',
  'documents:read',
  'documents:upload',
  'documents:delete',
  'audit:read',
  'profile:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS = {
  Admin: [
    'users:read',
    'users:manage',
    'documents:read',
    'documents:upload',
    'documents:delete',
    'audit:read',
    'profile:read',
  ],
  Analyst: [
    'documents:read',
    'documents:upload',
    'documents:delete',
    'audit:read',
    'profile:read',
  ],
  Employee: [
    'documents:read',
    'documents:upload',
    'documents:delete',
    'profile:read',
  ],
} as const satisfies Record<UserRole, readonly Permission[]>;

export function roleHasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  const permissions: readonly Permission[] = ROLE_PERMISSIONS[role];

  return permissions.includes(permission);
}


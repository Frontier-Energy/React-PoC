import { platform } from './platform';

const USER_ID_STORAGE_KEY = 'userId';
const USER_ROLES_STORAGE_KEY = 'userRoles';

const getAuthStorage = () => platform.authSession.getStorage();

export const DEFAULT_USER_ROLE = 'user';
export const ADMIN_ROLE = 'admin';

export type AppRole = typeof DEFAULT_USER_ROLE | typeof ADMIN_ROLE | string;
export type AppPermission = 'tenant.select' | 'customization.admin';

const ROLE_PERMISSIONS: Record<string, ReadonlyArray<AppPermission>> = {
  [DEFAULT_USER_ROLE]: [],
  [ADMIN_ROLE]: ['tenant.select', 'customization.admin'],
};

const normalizeRole = (role: string): string => role.trim().toLowerCase();

const normalizeRoles = (roles: ReadonlyArray<string> | null | undefined): string[] => {
  if (!roles || roles.length === 0) {
    return [DEFAULT_USER_ROLE];
  }

  const normalized = roles
    .map((role) => normalizeRole(role))
    .filter((role) => role.length > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [DEFAULT_USER_ROLE];
};

export const getUserId = () => getAuthStorage()?.getItem(USER_ID_STORAGE_KEY) ?? null;

export const getUserRoles = (): string[] => {
  const stored = getAuthStorage()?.getItem(USER_ROLES_STORAGE_KEY);
  if (!stored) {
    return [DEFAULT_USER_ROLE];
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return normalizeRoles(parsed.filter((value): value is string => typeof value === 'string'));
    }
  } catch (error) {
    // Ignore malformed storage and fall back to safe defaults.
  }

  return [DEFAULT_USER_ROLE];
};

export const setUserId = (userId: string, roles: ReadonlyArray<string> = [DEFAULT_USER_ROLE]) => {
  const storage = getAuthStorage();
  storage?.setItem(USER_ID_STORAGE_KEY, userId);
  storage?.setItem(USER_ROLES_STORAGE_KEY, JSON.stringify(normalizeRoles(roles)));
};

export const hasRole = (requiredRole: string): boolean => {
  const normalizedRequiredRole = normalizeRole(requiredRole);
  return getUserRoles().some((role) => role === normalizedRequiredRole);
};

export const hasPermission = (permission: AppPermission): boolean => {
  const roles = getUserRoles();
  return roles.some((role) => (ROLE_PERMISSIONS[role] ?? []).includes(permission));
};

export const isLoggedInAdmin = (): boolean => {
  const userId = getUserId();
  return Boolean(userId) && hasRole(ADMIN_ROLE);
};

export const parseRolesFromAuthPayload = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') {
    return [DEFAULT_USER_ROLE];
  }

  const roles = (payload as { roles?: unknown }).roles;
  if (Array.isArray(roles)) {
    return normalizeRoles(roles.filter((value): value is string => typeof value === 'string'));
  }

  const role = (payload as { role?: unknown }).role;
  if (typeof role === 'string') {
    return normalizeRoles([role]);
  }

  return [DEFAULT_USER_ROLE];
};

export const clearUserId = () => {
  const storage = getAuthStorage();
  storage?.removeItem(USER_ID_STORAGE_KEY);
  storage?.removeItem(USER_ROLES_STORAGE_KEY);
};

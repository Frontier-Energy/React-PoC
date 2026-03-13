import {
  clearUserId,
  getUserId,
  getUserRoles,
  hasRole,
  hasPermission,
  isLoggedInAdmin,
  parseRolesFromAuthPayload,
  setUserId,
} from './auth';

describe('auth storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and reads the user id', () => {
    setUserId('user-123');
    expect(getUserId()).toBe('user-123');
    expect(getUserRoles()).toEqual(['user']);
  });

  it('stores normalized roles with user id', () => {
    setUserId('user-123', ['Admin', 'admin', '']);
    expect(getUserRoles()).toEqual(['admin']);
  });

  it('matches admin permissions only when the user is logged in as admin', () => {
    setUserId('user-123', ['admin']);
    expect(hasPermission('tenant.select')).toBe(true);
    expect(isLoggedInAdmin()).toBe(true);

    clearUserId();
    expect(hasPermission('tenant.select')).toBe(false);
    expect(isLoggedInAdmin()).toBe(false);
  });

  it('parses roles from auth payload variants', () => {
    expect(parseRolesFromAuthPayload({ role: 'Admin' })).toEqual(['admin']);
    expect(parseRolesFromAuthPayload({ roles: ['User', 'Admin'] })).toEqual(['user', 'admin']);
    expect(parseRolesFromAuthPayload({})).toEqual(['user']);
  });

  it('clears the user id', () => {
    setUserId('user-123');
    clearUserId();
    expect(getUserId()).toBeNull();
    expect(getUserRoles()).toEqual(['user']);
  });

  it('falls back safely for malformed or empty stored roles', () => {
    localStorage.setItem('userRoles', '{invalid');
    expect(getUserRoles()).toEqual(['user']);

    localStorage.setItem('userRoles', JSON.stringify([]));
    expect(getUserRoles()).toEqual(['user']);

    localStorage.setItem('userRoles', JSON.stringify(['   ', 42, 'Admin']));
    expect(getUserRoles()).toEqual(['admin']);
  });

  it('evaluates role and permission checks across positive and negative cases', () => {
    setUserId('user-123', ['custom-role']);

    expect(hasRole('CUSTOM-ROLE')).toBe(true);
    expect(hasPermission('tenant.select')).toBe(false);
    expect(isLoggedInAdmin()).toBe(false);
  });

  it('parses malformed auth payload variants back to the default role', () => {
    expect(parseRolesFromAuthPayload(null)).toEqual(['user']);
    expect(parseRolesFromAuthPayload('admin')).toEqual(['user']);
    expect(parseRolesFromAuthPayload({ roles: [] })).toEqual(['user']);
    expect(parseRolesFromAuthPayload({ role: 42 })).toEqual(['user']);
  });
});

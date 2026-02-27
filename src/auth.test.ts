import { clearUserId, getUserId, setUserId } from './auth';

describe('auth storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and reads the user id', () => {
    setUserId('user-123');
    expect(getUserId()).toBe('user-123');
  });

  it('clears the user id', () => {
    setUserId('user-123');
    clearUserId();
    expect(getUserId()).toBeNull();
  });
});

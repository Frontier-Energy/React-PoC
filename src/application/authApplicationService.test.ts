import { createAuthApplicationService } from './authApplicationService';

describe('authApplicationService', () => {
  it('maps login payloads into persisted identities', async () => {
    const setUserIdMock = vi.fn();
    const service = createAuthApplicationService({
      fetcher: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          userID: 'user-1',
          roles: ['user'],
        }),
      })) as unknown as typeof fetch,
      getLoginUrl: () => '/login',
      getRegisterUrl: () => '/register',
      parseRolesFromAuthPayload: (payload) => (payload as { roles: string[] }).roles,
      setUserId: setUserIdMock,
    });

    await expect(service.lookupLoginIdentity('operator@frontierenergy.com')).resolves.toEqual({
      userId: 'user-1',
      roles: ['user', 'admin'],
    });
    expect(setUserIdMock).toHaveBeenCalledWith('user-1', ['user', 'admin']);
  });

  it('does not persist registration results without a user id', async () => {
    const setUserIdMock = vi.fn();
    const service = createAuthApplicationService({
      fetcher: vi
        .fn(async () => ({
          ok: true,
          json: async () => ({
            roles: ['user'],
          }),
        })) as unknown as typeof fetch,
      getLoginUrl: () => '/login',
      getRegisterUrl: () => '/register',
      parseRolesFromAuthPayload: (payload) => (payload as { roles: string[] }).roles,
      setUserId: setUserIdMock,
    });

    await expect(
      service.registerIdentity({
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        invalidInputMessage: 'invalid',
        serverErrorMessage: 'server',
      })
    ).resolves.toEqual({
      userId: '',
      roles: ['user'],
    });
    expect(setUserIdMock).not.toHaveBeenCalled();
  });

  it('surfaces validation errors from registration responses', async () => {
    const service = createAuthApplicationService({
      fetcher: vi.fn(async () => ({ ok: false, status: 422 })) as unknown as typeof fetch,
      getLoginUrl: () => '/login',
      getRegisterUrl: () => '/register',
      parseRolesFromAuthPayload: () => ['user'],
      setUserId: vi.fn(),
    });

    await expect(
      service.registerIdentity({
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        invalidInputMessage: 'invalid',
        serverErrorMessage: 'server',
      })
    ).rejects.toThrow('invalid');
  });
});

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

  it('throws when login lookup returns a non-ok response', async () => {
    const service = createAuthApplicationService({
      fetcher: vi.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch,
      getLoginUrl: () => '/login',
      getRegisterUrl: () => '/register',
      parseRolesFromAuthPayload: () => ['user'],
      setUserId: vi.fn(),
    });

    await expect(service.lookupLoginIdentity('user@example.com')).rejects.toThrow('Login lookup failed with status 401');
  });

  it('persists login identities when the payload uses the lowercase userid field', async () => {
    const setUserIdMock = vi.fn();
    const service = createAuthApplicationService({
      fetcher: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          userid: 'user-2',
          roles: ['user'],
        }),
      })) as unknown as typeof fetch,
      getLoginUrl: () => '/login',
      getRegisterUrl: () => '/register',
      parseRolesFromAuthPayload: (payload) => (payload as { roles: string[] }).roles,
      setUserId: setUserIdMock,
    });

    await expect(service.lookupLoginIdentity('user@example.com')).resolves.toEqual({
      userId: 'user-2',
      roles: ['user'],
    });
    expect(setUserIdMock).toHaveBeenCalledWith('user-2', ['user']);
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

  it('persists registration results when a user id is returned', async () => {
    const setUserIdMock = vi.fn();
    const service = createAuthApplicationService({
      fetcher: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          userId: 'registered-user',
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
      userId: 'registered-user',
      roles: ['user'],
    });
    expect(setUserIdMock).toHaveBeenCalledWith('registered-user', ['user']);
  });

  it('falls back to an empty registration result when a successful response body is not json', async () => {
    const setUserIdMock = vi.fn();
    const service = createAuthApplicationService({
      fetcher: vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error('not json');
        },
      })) as unknown as typeof fetch,
      getLoginUrl: () => '/login',
      getRegisterUrl: () => '/register',
      parseRolesFromAuthPayload: () => ['user'],
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
      roles: [],
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

  it('surfaces server errors from non-validation registration failures', async () => {
    const service = createAuthApplicationService({
      fetcher: vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch,
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
    ).rejects.toThrow('server');
  });
});

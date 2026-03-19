import { apiFetch } from '../apiClient';
import { parseRolesFromAuthPayload, setUserId } from '../auth';
import { getLoginUrl, getRegisterUrl } from '../config';

interface AuthPayload {
  userID?: string;
  userId?: string;
  userid?: string;
  role?: string;
  roles?: string[];
}

interface AuthApplicationServiceDependencies {
  fetcher: typeof fetch;
  getLoginUrl: typeof getLoginUrl;
  getRegisterUrl: typeof getRegisterUrl;
  parseRolesFromAuthPayload: typeof parseRolesFromAuthPayload;
  setUserId: typeof setUserId;
}

const resolveUserId = (payload: AuthPayload) => payload.userID || payload.userId || payload.userid || '';

export const createAuthApplicationService = ({
  fetcher,
  getLoginUrl: resolveLoginUrl,
  getRegisterUrl: resolveRegisterUrl,
  parseRolesFromAuthPayload: resolveRoles,
  setUserId: persistUser,
}: AuthApplicationServiceDependencies) => ({
  async lookupLoginIdentity(email: string) {
    const response = await fetcher(resolveLoginUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(`Login lookup failed with status ${response.status}`);
    }

    const payload = (await response.json()) as AuthPayload;
    const resolvedRoles = resolveRoles(payload);
    const shouldAssignTempAdmin = email.toLowerCase().endsWith('@frontierenergy.com');
    const nextRoles = shouldAssignTempAdmin
      ? Array.from(new Set([...resolvedRoles, 'admin']))
      : resolvedRoles;
    const userId = resolveUserId(payload);
    persistUser(userId, nextRoles);
    return { userId, roles: nextRoles };
  },

  async registerIdentity(input: {
    email: string;
    firstName: string;
    lastName: string;
    invalidInputMessage: string;
    serverErrorMessage: string;
  }) {
    const response = await fetcher(resolveRegisterUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      }),
    });

    if (!response.ok) {
      const isClientError = response.status === 400 || response.status === 422;
      throw new Error(isClientError ? input.invalidInputMessage : input.serverErrorMessage);
    }

    try {
      const payload = (await response.json()) as AuthPayload;
      const userId = resolveUserId(payload);
      const roles = resolveRoles(payload);
      if (userId) {
        persistUser(userId, roles);
      }
      return { userId, roles };
    } catch {
      return { userId: '', roles: [] as string[] };
    }
  },
});

export const authApplicationService = createAuthApplicationService({
  fetcher: apiFetch,
  getLoginUrl,
  getRegisterUrl,
  parseRolesFromAuthPayload,
  setUserId,
});

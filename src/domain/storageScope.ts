export const ANONYMOUS_USER_SCOPE = 'anonymous';

export interface ScopedEntity {
  tenantId: string;
  userId?: string | null;
}

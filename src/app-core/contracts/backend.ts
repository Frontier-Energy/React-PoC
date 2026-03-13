import type { components, paths } from './backend.generated';

export const BACKEND_OPENAPI_SNAPSHOT_PATH = 'contracts/backend.openapi.json';
export const DEFAULT_BACKEND_OPENAPI_URL = 'http://localhost:5108/swagger/v1/swagger.json';

export type BackendContractPaths = paths;
export type BackendContractSchemas = components['schemas'];

export type LoginRequestDto = BackendContractSchemas['LoginRequestCommand'];
export type LoginResponseDto = BackendContractSchemas['LoginRequestResponse'];
export type RegisterRequestDto = BackendContractSchemas['RegisterRequestModel'];
export type RegisterResponseDto = BackendContractSchemas['RegisterResponseModel'];

export type TenantBootstrapDto = BackendContractSchemas['TenantBootstrapResponse'];
export type FormSchemaDto = BackendContractSchemas['FormSchemaResponse'];
export type FormSchemaCatalogDto = BackendContractSchemas['FormSchemaCatalogResponse'];
export type TranslationsDto = BackendContractSchemas['TranslationsResponse'];
export type InspectionUploadResponseDto = BackendContractSchemas['ReceiveInspectionResponse'];
export type InspectionUploadMultipartDto =
  NonNullable<BackendContractPaths['/inspections']['post']['requestBody']>['content']['multipart/form-data'];

export interface RuntimeCompatibilityDto {
  minRuntimeVersion?: number;
  maxRuntimeVersion?: number;
}

export interface BackendContentEnvelopeDto<TPayload> {
  schemaVersion?: string;
  artifactVersion?: string;
  compatibility?: RuntimeCompatibilityDto;
  schema?: TPayload;
  labels?: TPayload;
}

export interface GovernedTenantBootstrapEnvelopeDto {
  schemaVersion?: string;
  artifactVersion?: string;
  environmentId?: string;
  config?: TenantBootstrapDto;
}

export type FormSchemaPayloadDto = FormSchemaDto | BackendContentEnvelopeDto<FormSchemaDto>;
export type TranslationsPayloadDto = TranslationsDto | BackendContentEnvelopeDto<TranslationsDto>;
export type TenantBootstrapPayloadDto = TenantBootstrapDto | GovernedTenantBootstrapEnvelopeDto;

export interface InspectionUploadPayloadDto {
  sessionId: string;
  idempotencyKey: string;
  name: string;
  userId: string;
  version: {
    clientRevision: number;
    baseServerRevision: string | null;
    mergePolicy: string;
  };
  queryParams: Record<string, string>;
}

// The beta Swagger document retrieved on March 9, 2026 does not document the 409 body yet.
export interface InspectionUploadConflictDto {
  message?: string | null;
  serverRevision?: string | null;
  serverUpdatedAt?: number | null;
  conflictingFields?: string[] | null;
}

export interface InspectionUploadSuccessDto extends InspectionUploadResponseDto {
  serverRevision?: string | null;
}

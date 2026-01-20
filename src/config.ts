export interface AppConfig {
  apiBaseUrl: string;
  uploadInspectionPath: string;
}

export const appConfig: AppConfig = {
  apiBaseUrl: 'https://react-receiver.icysmoke-6c3b2e19.centralus.azurecontainerapps.io',
  uploadInspectionPath: '/QHVAC/ReceiveInspection',
};

export const getUploadInspectionUrl = () =>
  `${appConfig.apiBaseUrl}${appConfig.uploadInspectionPath}`;

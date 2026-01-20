export interface AppConfig {
  apiBaseUrl: string;
  uploadInspectionPath: string;
  loginPath: string;
}

export const appConfig: AppConfig = {
  apiBaseUrl: 'https://react-receiver.icysmoke-6c3b2e19.centralus.azurecontainerapps.io',
  uploadInspectionPath: '/QHVAC/ReceiveInspection',
  loginPath: '/QHVAC/login',
};

export const getUploadInspectionUrl = () =>
  `${appConfig.apiBaseUrl}${appConfig.uploadInspectionPath}`;

export const getLoginUrl = () =>
  `${appConfig.apiBaseUrl}${appConfig.loginPath}`;

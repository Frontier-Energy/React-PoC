const USER_ID_STORAGE_KEY = 'userId';

export const getUserId = () => localStorage.getItem(USER_ID_STORAGE_KEY);

export const setUserId = (userId: string) => {
  localStorage.setItem(USER_ID_STORAGE_KEY, userId);
};

export const clearUserId = () => {
  localStorage.removeItem(USER_ID_STORAGE_KEY);
};

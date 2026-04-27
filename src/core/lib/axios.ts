import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_ENDPOINT = '/auth/refresh-token';
const AUTH_SKIP_REFRESH_PATHS = [
    REFRESH_ENDPOINT,
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
];

type RetryableRequestConfig = InternalAxiosRequestConfig & {
    _retry?: boolean;
};

type PendingRequest = {
    config: RetryableRequestConfig;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
};

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

const refreshClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

let isRefreshing = false;
let pendingRequests: PendingRequest[] = [];

const getStoredAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);

const setStoredAccessToken = (token: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
};

const clearStoredAccessToken = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
};

const redirectToLogin = () => {
    if (typeof window === 'undefined') {
        return;
    }

    if (window.location.pathname !== '/login') {
        window.location.replace('/login');
    }
};

const handleAuthFailure = () => {
    clearStoredAccessToken();
    redirectToLogin();
};

const normalizeAxiosError = (error: unknown) => {
    if (!axios.isAxiosError(error)) {
        return error;
    }

    const responseData = error.response?.data;
    if (responseData && typeof responseData === 'object') {
        return {
            ...responseData,
            message:
                'message' in responseData && typeof responseData.message === 'string'
                    ? responseData.message
                    : error.message,
            status: error.response?.status,
        };
    }

    return {
        message: error.message,
        status: error.response?.status,
    };
};

const shouldSkipRefresh = (url?: string) => {
    if (!url) {
        return false;
    }

    return AUTH_SKIP_REFRESH_PATHS.some((path) => url.includes(path));
};

const setAuthorizationHeader = (config: RetryableRequestConfig, token: string) => {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
};

const flushPendingRequests = (accessToken: string) => {
    pendingRequests.forEach(({ config, resolve }) => {
        config._retry = true;
        setAuthorizationHeader(config, accessToken);
        resolve(axiosInstance(config));
    });
    pendingRequests = [];
};

const rejectPendingRequests = (error: unknown) => {
    const normalizedError = normalizeAxiosError(error);
    pendingRequests.forEach(({ reject }) => reject(normalizedError));
    pendingRequests = [];
};

const refreshAccessToken = async () => {
    const response = await refreshClient.post<{ access_token?: string }>(REFRESH_ENDPOINT);
    const nextAccessToken = response.data?.access_token;

    if (!nextAccessToken) {
        throw new Error('Refresh token response does not contain an access token');
    }

    setStoredAccessToken(nextAccessToken);
    return nextAccessToken;
};

axiosInstance.interceptors.request.use(
    (config) => {
        const token = getStoredAccessToken();
        if (token) {
            const headers = AxiosHeaders.from(config.headers);
            headers.set('Authorization', `Bearer ${token}`);
            config.headers = headers;
        }

        return config;
    },
    (error) => Promise.reject(normalizeAxiosError(error))
);

axiosInstance.interceptors.response.use(
    (response) => response.data,
    async (error) => {
        const originalRequest = error.config as RetryableRequestConfig | undefined;
        const status = error.response?.status;

        if (status !== 401 || !originalRequest) {
            return Promise.reject(normalizeAxiosError(error));
        }

        if (shouldSkipRefresh(originalRequest.url)) {
            if (originalRequest.url?.includes(REFRESH_ENDPOINT)) {
                handleAuthFailure();
            }

            return Promise.reject(normalizeAxiosError(error));
        }

        if (originalRequest._retry) {
            handleAuthFailure();
            return Promise.reject(normalizeAxiosError(error));
        }

        if (isRefreshing) {
            originalRequest._retry = true;
            return new Promise((resolve, reject) => {
                pendingRequests.push({
                    config: originalRequest,
                    resolve,
                    reject,
                });
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const nextAccessToken = await refreshAccessToken();
            flushPendingRequests(nextAccessToken);
            setAuthorizationHeader(originalRequest, nextAccessToken);
            return axiosInstance(originalRequest);
        } catch (refreshError) {
            rejectPendingRequests(refreshError);
            handleAuthFailure();
            return Promise.reject(normalizeAxiosError(refreshError));
        } finally {
            isRefreshing = false;
        }
    }
);

export default axiosInstance;

import axios, { type InternalAxiosRequestConfig } from 'axios';
import { APP_ENVs } from './enviroments';

const serializeParams = (params: Record<string, unknown>) => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value == null || value === '') {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (item != null && item !== '') {
                    searchParams.append(key, String(item));
                }
            });
            return;
        }

        searchParams.append(key, String(value));
    });

    return searchParams.toString();
};

export const axiosInstance = axios.create({
    baseURL: APP_ENVs.API_URL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
    paramsSerializer: (params) => serializeParams(params),
});

axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        return config;
    },
    (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(error)
);

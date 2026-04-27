import type { AxiosRequestConfig } from 'axios';
import axiosInstance from './axios';

export const api = {
    get<T>(url: string, config?: AxiosRequestConfig) {
        return axiosInstance.get<T, T>(url, config);
    },

    post<T, TBody = unknown>(url: string, data?: TBody, config?: AxiosRequestConfig<TBody>) {
        return axiosInstance.post<T, T>(url, data, config);
    },

    put<T, TBody = unknown>(url: string, data?: TBody, config?: AxiosRequestConfig<TBody>) {
        return axiosInstance.put<T, T>(url, data, config);
    },

    patch<T, TBody = unknown>(url: string, data?: TBody, config?: AxiosRequestConfig<TBody>) {
        return axiosInstance.patch<T, T>(url, data, config);
    },

    delete<T = void>(url: string, config?: AxiosRequestConfig) {
        return axiosInstance.delete<T, T>(url, config);
    },
};

export default api;

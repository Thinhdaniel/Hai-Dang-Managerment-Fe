import api from '../lib/api';
import type { Brand, CreateUserPayload, Notification, PaginatedResponse, UpdateUserPayload, User, UserListParams } from '../types';
export { dashboardService } from './dashboard.service';
export { plantService } from './plant.service';
export { facilityCostReportService } from './report.service';

export type UserListApiResponse = User[] | PaginatedResponse<User>;

export interface Supplier {
    id: string;
    name: string;
    code?: string;
    phone?: string;
    address?: string;
    contactName?: string;
    supplyTypes?: string[];
    isActive?: boolean;
}

export const supplierService = {
    getAll: (params?: { limit?: number; search?: string }): Promise<Supplier[]> => 
        api.get<Supplier[]>('/material-suppliers', { params }),
};

export const brandService = {
    getAll: (params?: { search?: string }): Promise<Brand[]> => api.get<Brand[]>('/brands', { params }),

    create: (data: { name: string; description?: string }): Promise<Brand> => api.post<Brand>('/brands', data),

    update: (id: string, data: { name: string; description?: string }): Promise<Brand> =>
        api.put<Brand>(`/brands/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`/brands/${id}`),
};

export const userService = {
    getAll: (params?: UserListParams): Promise<UserListApiResponse> => api.get<UserListApiResponse>('/users', { params }),

    getById: (id: string): Promise<User> => api.get<User>(`/users/${id}`),

    create: (data: CreateUserPayload): Promise<User> => api.post<User, CreateUserPayload>('/users', data),

    update: (id: string, data: UpdateUserPayload): Promise<User> =>
        api.patch<User, UpdateUserPayload>(`/users/${id}`, data),

    delete: (id: string): Promise<void> => api.delete(`/users/${id}`),

    getMe: (): Promise<User> => api.get<User>('/users/me'),
};

export const notificationService = {
    getAll: (): Promise<Notification[]> => api.get<Notification[]>('/notifications'),

    markAsRead: (id: string): Promise<void> => api.patch(`/notifications/${id}/read`),

    markAllAsRead: (): Promise<void> => api.patch('/notifications/read-all'),
};

export const authService = {
    login: (email: string, password: string): Promise<{ access_token: string; user: User }> =>
        api.post<{ access_token: string; user: User }>('/auth/login', { email, password }),

    forgotPassword: (email: string): Promise<void> => api.post('/auth/forgot-password', { email }),

    resetPassword: (token: string, password: string): Promise<{ access_token: string; user: User }> =>
        api.post<{ access_token: string; user: User }>('/auth/reset-password', { token, password }),

    logout: (): Promise<void> => api.post('/auth/logout'),
};

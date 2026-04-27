import type { User } from '../types';
import { UserRole } from '../types';

type Role = User['role'] | null | undefined;

export const hasManagerAccess = (role: Role) => role === UserRole.ADMIN || role === UserRole.MANAGER;

export const isAdmin = (role: Role) => role === UserRole.ADMIN;

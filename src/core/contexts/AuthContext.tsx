import { createContext, useContext, useEffect, useMemo, useCallback, useState, type PropsWithChildren } from 'react';
import { authService, userService } from '../services';
import type { User } from '../types';
import { useNotificationStore } from '../notificationStore';
import { queryClient } from '../queryClient';
import { pushNotificationService } from '../services/push-notification.service';
import { socketService } from '../services/socket.service';
import { syncAppBadge } from '../lib/app-badge';
import {
    ACCESS_TOKEN_KEY,
    AUTH_SESSION_EXPIRED_EVENT,
    AUTH_TOKEN_CHANGED_EVENT,
    clearStoredAccessToken,
    getAccessTokenExpirationMs,
    getStoredAccessToken,
    setStoredAccessToken,
    type AuthTokenChangedDetail,
} from '../lib/auth-session';
import { clearAllAssistantSessions } from '../lib/assistant-session';

type LoginResult = {
    access_token: string;
    user: User;
};

type AuthContextValue = {
    user: User | null;
    role: User['role'] | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<LoginResult>;
    logout: () => Promise<void>;
    setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
    const [user, setUserState] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());

    const clearLocalSession = useCallback(() => {
        clearStoredAccessToken();
        clearAllAssistantSessions();
        setAccessToken(null);
        setUserState(null);
        socketService.disconnect();
        queryClient.clear();
        useNotificationStore.getState().clearNotifications();
        void syncAppBadge(0);
    }, []);

    const verifyCurrentSession = useCallback(async () => {
        try {
            const currentUser = await userService.getMe();
            setUserState(currentUser);
            void pushNotificationService.ensureCurrentDevice().catch(() => {});
        } catch {
            clearLocalSession();
        }
    }, [clearLocalSession]);

    useEffect(() => {
        if (!accessToken) {
            setUserState(null);
            return;
        }

        let ignore = false;

        const syncCurrentUser = async () => {
            try {
                const currentUser = await userService.getMe();
                if (!ignore) {
                    setUserState(currentUser);
                    void pushNotificationService.ensureCurrentDevice().catch(() => {});
                }
            } catch {
                if (!ignore) {
                    clearLocalSession();
                }
            }
        };

        void syncCurrentUser();

        return () => {
            ignore = true;
        };
    }, [accessToken, clearLocalSession]);

    useEffect(() => {
        const onSessionExpired = () => {
            clearLocalSession();
        };

        window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
        return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
    }, [clearLocalSession]);

    useEffect(() => {
        const onTokenChanged = (event: Event) => {
            const nextToken =
                (event as CustomEvent<AuthTokenChangedDetail>).detail?.accessToken ?? getStoredAccessToken();
            setAccessToken(nextToken);
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key !== ACCESS_TOKEN_KEY) return;

            if (event.newValue) {
                setAccessToken(event.newValue);
                return;
            }

            clearLocalSession();
        };

        window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged);
            window.removeEventListener('storage', onStorage);
        };
    }, [clearLocalSession]);

    useEffect(() => {
        if (!accessToken) return;

        const expiresAt = getAccessTokenExpirationMs(accessToken);
        if (!expiresAt) return;

        const checkSession = () => {
            void verifyCurrentSession();
        };
        const delay = Math.max(expiresAt - Date.now() + 1000, 0);
        const timeoutId = window.setTimeout(checkSession, delay);

        const checkWhenVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() < expiresAt) return;
            checkSession();
        };

        window.addEventListener('focus', checkWhenVisible);
        document.addEventListener('visibilitychange', checkWhenVisible);

        return () => {
            window.clearTimeout(timeoutId);
            window.removeEventListener('focus', checkWhenVisible);
            document.removeEventListener('visibilitychange', checkWhenVisible);
        };
    }, [accessToken, verifyCurrentSession]);

    const setUser = (nextUser: User | null) => {
        setUserState(nextUser);
    };

    const login = async (email: string, password: string) => {
        const result = await authService.login(email, password);

        queryClient.clear();
        useNotificationStore.getState().clearNotifications();
        void syncAppBadge(0);

        setStoredAccessToken(result.access_token);
        setAccessToken(result.access_token);
        setUserState(result.user);
        void pushNotificationService.ensureCurrentDevice().catch(() => {});

        return result;
    };

    const logout = () => {
        clearLocalSession();
        void authService.logout().catch(() => {
            // Server logout is best-effort; local session is already cleared.
        });

        return Promise.resolve();
    };

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            role: user?.role ?? null,
            accessToken,
            isAuthenticated: Boolean(accessToken),
            login,
            logout,
            setUser,
        }),
        [accessToken, clearLocalSession, user]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
};

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren,
} from 'react';
import { authService, userService } from '../services';
import type { User } from '../types';

const ACCESS_TOKEN_KEY = 'access_token';

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

const getStoredAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);

const setStoredAccessToken = (token: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
};

const clearStoredAccessToken = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
    const [user, setUserState] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());

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
                }
            } catch {
                if (!ignore) {
                    clearStoredAccessToken();
                    setAccessToken(null);
                    setUserState(null);
                }
            }
        };

        void syncCurrentUser();

        return () => {
            ignore = true;
        };
    }, [accessToken]);

    const setUser = (nextUser: User | null) => {
        setUserState(nextUser);
    };

    const login = async (email: string, password: string) => {
        const result = await authService.login(email, password);

        setStoredAccessToken(result.access_token);
        setAccessToken(result.access_token);
        setUserState(result.user);

        return result;
    };

    const logout = async () => {
        try {
            await authService.logout();
        } catch {
            // Clear local auth state even if the server session is already invalid.
        } finally {
            clearStoredAccessToken();
            setAccessToken(null);
            setUserState(null);
        }
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
        [accessToken, user]
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

export const ACCESS_TOKEN_KEY = 'access_token';

export const AUTH_SESSION_EXPIRED_EVENT = 'hai-dang:auth-session-expired';
export const AUTH_TOKEN_CHANGED_EVENT = 'hai-dang:auth-token-changed';

export type AuthSessionExpiredDetail = {
    reason?: string;
};

export type AuthTokenChangedDetail = {
    accessToken: string | null;
};

export const getStoredAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);

export const setStoredAccessToken = (token: string) => {
    const previousToken = getStoredAccessToken();
    localStorage.setItem(ACCESS_TOKEN_KEY, token);

    if (previousToken !== token) {
        notifyAuthTokenChanged(token);
    }
};

export const clearStoredAccessToken = () => {
    const previousToken = getStoredAccessToken();
    localStorage.removeItem(ACCESS_TOKEN_KEY);

    if (previousToken) {
        notifyAuthTokenChanged(null);
    }
};

export const notifyAuthSessionExpired = (detail: AuthSessionExpiredDetail = {}) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(new CustomEvent<AuthSessionExpiredDetail>(AUTH_SESSION_EXPIRED_EVENT, { detail }));
};

export const notifyAuthTokenChanged = (accessToken: string | null) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(
        new CustomEvent<AuthTokenChangedDetail>(AUTH_TOKEN_CHANGED_EVENT, {
            detail: { accessToken },
        })
    );
};

export const getAccessTokenExpirationMs = (token: string | null) => {
    if (!token) {
        return null;
    }

    const [, payload] = token.split('.');
    if (!payload) {
        return null;
    }

    try {
        const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
        const paddedPayload = normalizedPayload.padEnd(
            normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
            '='
        );
        const decoded = JSON.parse(window.atob(paddedPayload)) as { exp?: unknown };
        const exp = Number(decoded.exp);

        return Number.isFinite(exp) ? exp * 1000 : null;
    } catch {
        return null;
    }
};

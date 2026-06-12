type ErrorWithStatus = {
    status?: unknown;
    response?: {
        status?: unknown;
    };
};

export const getHttpStatus = (error: unknown) => {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const err = error as ErrorWithStatus;
    const directStatus = Number(err.status);
    if (Number.isFinite(directStatus)) {
        return directStatus;
    }

    const responseStatus = Number(err.response?.status);
    return Number.isFinite(responseStatus) ? responseStatus : undefined;
};

export const shouldRetryQuery = (failureCount: number, error: unknown) => {
    const status = getHttpStatus(error);

    if (status === 401 || status === 403) {
        return false;
    }

    return failureCount < 1;
};

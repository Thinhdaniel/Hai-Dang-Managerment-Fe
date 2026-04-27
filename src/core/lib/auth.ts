export const resolveAuthErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }

    return fallbackMessage;
};

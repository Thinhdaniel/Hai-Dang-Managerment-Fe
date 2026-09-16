export const productionErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message.trim() || fallback;
    }
    return fallback;
};

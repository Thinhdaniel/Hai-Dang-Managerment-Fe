export const buildParams = (params: Record<string, string>) => {
    const normalizedEntries = Object.entries(params).filter(([, value]) => value !== '' && value !== 'undefined');
    const normalized = Object.fromEntries(normalizedEntries);

    if (normalized.page) normalized.page = Number(normalized.page) as unknown as string;
    if (normalized.limit) normalized.limit = Number(normalized.limit) as unknown as string;

    return normalized;
};

export const normalizeSearchTerm = (value?: string | null) => {
    if (!value) {
        return '';
    }

    return value.trim().replace(/\s+/g, ' ');
};

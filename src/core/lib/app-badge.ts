type NavigatorWithBadging = Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
};

export const syncAppBadge = async (count: number) => {
    if (typeof navigator === 'undefined') return;

    const badgeNavigator = navigator as NavigatorWithBadging;
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

    try {
        if (safeCount > 0 && badgeNavigator.setAppBadge) {
            await badgeNavigator.setAppBadge(safeCount);
            return;
        }

        if (badgeNavigator.clearAppBadge) {
            await badgeNavigator.clearAppBadge();
            return;
        }

        if (badgeNavigator.setAppBadge) {
            await badgeNavigator.setAppBadge(0);
        }
    } catch {
        // iOS lets users disable badges separately from notification permission.
    }
};

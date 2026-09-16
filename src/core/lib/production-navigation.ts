const dailyRoutes = ['/production', '/production/planning', '/production/monitor', '/production/reports'];

export const partitionProductionNavigation = <T extends { to: string }>(items: T[]) => {
    const daily = dailyRoutes.flatMap((path) => items.filter((item) => item.to === path));
    const ordered = [...daily, ...items.filter((item) => !dailyRoutes.includes(item.to))];
    const limit = ordered.length > 5 ? 4 : 5;
    return { primary: ordered.slice(0, limit), overflow: ordered.slice(limit) };
};

import type { Plant } from '../types';

const plantCollator = new Intl.Collator('vi', {
    numeric: true,
    sensitivity: 'base',
});

const extractPlantOrderNumber = (plant: Pick<Plant, 'code' | 'name'>) => {
    const codeMatch = plant.code?.match(/\d+/);
    if (codeMatch) return Number(codeMatch[0]);

    const nameMatch = plant.name?.match(/\d+/);
    return nameMatch ? Number(nameMatch[0]) : null;
};

export const sortPlantsNaturally = <T extends Pick<Plant, 'code' | 'name'>>(plants: T[]) =>
    [...plants].sort((left, right) => {
        const leftNumber = extractPlantOrderNumber(left);
        const rightNumber = extractPlantOrderNumber(right);

        if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }

        if (leftNumber !== null && rightNumber === null) return -1;
        if (leftNumber === null && rightNumber !== null) return 1;

        return plantCollator.compare(left.name || left.code || '', right.name || right.code || '');
    });

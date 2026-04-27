import { useQuery } from '@tanstack/react-query';
import { publicMachineService } from '../services/public-machine.service';

export const usePublicMachine = (publicId: string) =>
    useQuery({
        queryKey: ['public-machine', publicId],
        queryFn: () => publicMachineService.getByPublicId(publicId),
        enabled: Boolean(publicId),
        staleTime: 5 * 60_000,
        retry: false,
    });

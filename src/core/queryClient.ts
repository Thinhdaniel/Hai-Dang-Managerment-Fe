import { QueryClient } from '@tanstack/react-query';
import { shouldRetryQuery } from './lib/query-retry';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
        },
    },
});

import { useQuery, type QueryObserverOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import { useParams } from 'react-router-dom';
import useSendMessage from './useSendMessage';
import { shouldRetryQuery } from '../lib/query-retry';

type BaseOptions<T> = Partial<
    Pick<
        QueryObserverOptions<T>,
        | 'refetchOnWindowFocus'
        | 'refetchOnReconnect'
        | 'refetchOnMount'
        | 'staleTime'
        | 'gcTime'
        | 'retry'
        | 'retryDelay'
        | 'enabled'
    >
>;

type TuseFetchDetail<T> = {
    queryKey?: string | string[];
    param?: string;
    queryFn: (param: AxiosRequestConfig['params']) => Promise<T>;
    errorFn?: (error: any) => void;
} & BaseOptions<T>;

export const useFetchDetail = <T,>({ queryFn, queryKey, param, errorFn, ...rest }: TuseFetchDetail<T>) => {
    const { sendMessage } = useSendMessage();
    const params = useParams();

    const baseKey = Array.isArray(queryKey) ? queryKey : queryKey ? [queryKey] : ['default'];

    const detailKey = param ? (params[param] ?? null) : null;
    const qKey = [...baseKey, detailKey];

    const { data, isLoading, isError, refetch, isPending, isFetching } = useQuery({
        queryKey: qKey,
        queryFn: async () => {
            try {
                const res = await queryFn(detailKey);
                return res;
            } catch (error) {
                if (errorFn) errorFn(error);
                else sendMessage('error', 'Đã có lỗi xảy ra');
                throw error;
            }
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
        refetchOnMount: true,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        retry: shouldRetryQuery,
        retryDelay: 3000,
        ...rest,
    });

    return { data, isLoading, isError, refetch, isPending, isFetching };
};

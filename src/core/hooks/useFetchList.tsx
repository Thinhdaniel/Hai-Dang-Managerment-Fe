import { useQuery, type QueryObserverOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import { useSearchParams } from 'react-router-dom';
import useAbortController from './useAbortController';
import useSendMessage from './useSendMessage';
import { buildParams } from '../lib/route';

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
        | 'placeholderData'
    >
>;

type TuseFetchList<T> = {
    queryKey: string | any[];
    queryFn: (param: any, signal?: AxiosRequestConfig['signal']) => Promise<T>;
    errorFn?: (error: any) => void;
} & BaseOptions<T>;

export const useFetchList = <T,>({ queryFn: fn, queryKey, errorFn, ...rest }: TuseFetchList<T>) => {
    const [searchParam] = useSearchParams();
    const { sendMessage } = useSendMessage();
    const getSignal = useAbortController();

    const params = Object.fromEntries(searchParam.entries());
    const normalizedParams = buildParams(params);
    const key = Array.isArray(queryKey) ? [...queryKey] : queryKey;

    const { data, isLoading, isError, isSuccess, refetch } = useQuery({
        queryKey: [key, params],
        queryFn: async () => {
            const signal = getSignal();
            try {
                return fn(normalizedParams, signal);
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

        staleTime: 3 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        retry: 1,
        retryDelay: 3000,

        ...rest,
    });

    return { data, isLoading, isError, isSuccess, refetch };
};

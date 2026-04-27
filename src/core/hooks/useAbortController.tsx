import { useCallback, useEffect, useRef } from 'react';

const useAbortController = () => {
    const ref = useRef<AbortController | null>(null);

    const getController = useCallback(() => {
        // In React StrictMode (dev), effects can mount/unmount/mount to detect issues.
        // If we keep a single controller and abort it during cleanup, subsequent requests
        // would reuse an already-aborted signal and Axios will throw ERR_CANCELED.
        if (!ref.current || ref.current.signal.aborted) ref.current = new AbortController();
        return ref.current;
    }, []);

    const getSignal = useCallback(() => getController().signal, [getController]);

    useEffect(() => {
        return () => ref.current?.abort();
    }, [getController]);

    return getSignal;
};

export default useAbortController;

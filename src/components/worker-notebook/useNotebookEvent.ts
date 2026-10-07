import { useEffect, useState } from 'react';
import { isNotebookWomensDayActive, notebookVietnamDate } from './notebook-event';

export default function useNotebookEvent() {
    const [date, setDate] = useState(() => notebookVietnamDate());
    useEffect(() => {
        const refresh = () => setDate(notebookVietnamDate());
        // Also recheck when a suspended tab is opened, or the device wakes up.
        const interval = window.setInterval(refresh, 30_000);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);
    // Local preview changes the decoration only, never the notebook's working date.
    const preview =
        import.meta.env.DEV && new URLSearchParams(window.location.search).get('notebookEvent') === 'women-day';
    return isNotebookWomensDayActive(date) || preview;
}

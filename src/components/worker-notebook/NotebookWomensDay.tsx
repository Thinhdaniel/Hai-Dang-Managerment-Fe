import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp, MailOpen } from 'lucide-react';
import { notebookEventStorageKey } from './notebook-event';
import NotebookWomensDayCard from './NotebookWomensDayCard';

function readPreference(key: string, session = false): boolean {
    try {
        return (session ? window.sessionStorage : window.localStorage).getItem(key) === '1';
    } catch {
        return false;
    }
}

function savePreference(key: string, value: boolean, session = false) {
    try {
        (session ? window.sessionStorage : window.localStorage).setItem(key, value ? '1' : '0');
    } catch {
        // Storage restrictions must not prevent using the notebook or the greeting.
    }
}

export default function NotebookWomensDay({ userId }: { userId: string }) {
    const bodyId = useId();
    const titleId = useId();
    const collapsedKey = notebookEventStorageKey(userId, 'collapsed');
    const seenKey = notebookEventStorageKey(userId, 'seen');
    const [collapsed, setCollapsed] = useState(() => readPreference(collapsedKey));
    const [animate] = useState(() => !readPreference(seenKey, true));
    const [cardOpen, setCardOpen] = useState(false);

    useEffect(() => {
        savePreference(seenKey, true, true);
    }, [seenKey]);

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        savePreference(collapsedKey, next);
    };

    return (
        <>
            <section
                className='wn-womens-day'
                aria-labelledby={titleId}
                data-collapsed={collapsed}
                data-animate={animate}
            >
                <div className='wn-womens-day-copy'>
                    <p className='wn-womens-day-occasion'>Chúc mừng 20/10</p>
                    <h2 id={titleId}>
                        Ngày Phụ nữ <span>Việt Nam</span>
                    </h2>
                    <div id={bodyId} className='wn-womens-day-recipient' hidden={collapsed}>
                        Gửi đến toàn thể chị em Hải Đăng
                    </div>
                </div>
                <div className='wn-womens-day-art' aria-hidden='true'>
                    <span className='wn-womens-day-swatch' />
                    <img
                        src='/brand/womens-day-bouquet-v2.webp'
                        alt=''
                        width={960}
                        height={960}
                        draggable={false}
                        decoding='async'
                    />
                </div>
                <svg
                    className='wn-womens-day-thread'
                    viewBox='0 0 600 120'
                    fill='none'
                    aria-hidden='true'
                    focusable='false'
                >
                    <path
                        pathLength='1'
                        d='M5 106C101 116 103 55 174 80C251 107 259 8 290 20C326 35 227 71 263 96C302 121 346 46 414 72C480 98 522 100 595 33'
                    />
                </svg>
                <div className='wn-womens-day-actions'>
                    <button type='button' className='wn-womens-day-open' onClick={() => setCardOpen(true)}>
                        <MailOpen size={18} /> Mở thiệp
                    </button>
                    <button
                        type='button'
                        className='wn-womens-day-toggle'
                        aria-expanded={!collapsed}
                        aria-controls={bodyId}
                        onClick={toggle}
                    >
                        {collapsed ? 'Hiện đầy đủ' : 'Thu gọn'}
                        {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </button>
                </div>
            </section>
            <NotebookWomensDayCard open={cardOpen} onClose={() => setCardOpen(false)} />
        </>
    );
}

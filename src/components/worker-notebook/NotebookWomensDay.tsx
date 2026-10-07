import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { notebookEventStorageKey } from './notebook-event';

function readPreference(key: string, session = false, fallback = false): boolean {
    try {
        const value = (session ? window.sessionStorage : window.localStorage).getItem(key);
        return value === null ? fallback : value === '1';
    } catch {
        return fallback;
    }
}

function savePreference(key: string, value: boolean, session = false) {
    try {
        (session ? window.sessionStorage : window.localStorage).setItem(key, value ? '1' : '0');
    } catch {
        // Private browsing / full storage must not prevent using the notebook.
    }
}

export default function NotebookWomensDay({ userId }: { userId: string }) {
    const bodyId = useId();
    const titleId = useId();
    const collapsedKey = notebookEventStorageKey(userId, 'collapsed');
    const seenKey = notebookEventStorageKey(userId, 'seen');
    const [collapsed, setCollapsed] = useState(() =>
        readPreference(collapsedKey, false, window.matchMedia('(max-width: 767px)').matches)
    );
    const [animate] = useState(() => !readPreference(seenKey, true));

    useEffect(() => {
        savePreference(seenKey, true, true);
    }, [seenKey]);

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        savePreference(collapsedKey, next);
    };

    return (
        <section className='wn-womens-day' aria-labelledby={titleId} data-collapsed={collapsed} data-animate={animate}>
            <div className='wn-womens-day-date' aria-hidden='true'>
                <span>20</span>
                <span>10</span>
            </div>
            <div className='wn-womens-day-copy'>
                <h2 id={titleId}>Chúc mừng ngày Phụ nữ Việt Nam</h2>
                <div id={bodyId} className='wn-womens-day-message' aria-hidden={collapsed}>
                    <div>
                        <p>
                            Gửi lời cảm ơn đến những người phụ nữ đã cùng làm nên Hải Đăng. Chúc chị em nhiều sức khỏe,
                            niềm vui và những khoảng thời gian dành cho chính mình.
                        </p>
                    </div>
                </div>
                <button
                    type='button'
                    className='wn-womens-day-toggle'
                    aria-expanded={!collapsed}
                    aria-controls={bodyId}
                    onClick={toggle}
                >
                    {collapsed ? 'Xem lời chúc' : 'Thu gọn lời chúc'}
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
            </div>
            <svg className='wn-thread-flower' viewBox='0 0 300 170' fill='none' aria-hidden='true' focusable='false'>
                <path
                    className='wn-thread-flower-wash'
                    d='M190 38C211 9 264 29 268 68C289 95 274 130 244 135C207 158 167 137 155 109C133 85 155 48 190 38Z'
                    fill='currentColor'
                />
                <g stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
                    <path
                        className='wn-thread-flower-line'
                        pathLength='1'
                        d='M6 146C42 163 28 119 55 131C87 154 91 135 114 142C145 152 162 147 183 128C200 112 205 100 209 83C224 88 242 74 237 66C232 59 217 66 211 75C223 57 226 43 216 41C205 39 203 58 207 73C202 56 186 45 180 55C176 64 193 74 205 77C185 73 173 88 184 94C194 100 205 88 209 81C214 108 230 119 242 114C249 103 225 98 214 107M191 124C173 123 163 111 164 105C178 102 188 108 194 119'
                    />
                    <path className='wn-thread-flower-detail' d='M205 79C206 74 214 75 213 80C212 85 204 84 205 79Z' />
                </g>
            </svg>
        </section>
    );
}

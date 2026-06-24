import React, { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Grid, Input, Tag, Tooltip } from 'antd';
import {
    AppstoreOutlined,
    CloseOutlined,
    DollarOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    FormOutlined,
    RobotOutlined,
    SendOutlined,
    ShoppingOutlined,
    ThunderboltOutlined,
    ToolOutlined,
    TrophyOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    operationsAssistantService,
    type AssetAssistantResponse,
    type AssistantAppliedFilters,
} from '../core/services/ai-help.service';
import { getAssetStatusColor } from '../core/constants/assetStatusColor';
import type { AssetStatus } from '../core/types';

type ChatMessage = { role: 'user' | 'assistant'; content: string; data?: AssetAssistantResponse; animate?: boolean };

// Lưu phiên chat để không mất khi chuyển trang / reload (giữ tối đa 30 tin gần nhất).
const CHAT_KEY = 'hd-asset-assistant-chat';
const loadChat = (): ChatMessage[] => {
    try {
        const raw = localStorage.getItem(CHAT_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
};
const saveChat = (msgs: ChatMessage[]) => {
    try {
        // Không lưu cờ animate (để mở lại không chạy hiệu ứng chữ với tin cũ).
        const slim = msgs.slice(-30).map((m) => ({ role: m.role, content: m.content, data: m.data }));
        localStorage.setItem(CHAT_KEY, JSON.stringify(slim));
    } catch {
        /* bỏ qua khi storage đầy/không khả dụng */
    }
};

// Gợi ý mở đầu phân nhóm — khoe đủ năng lực: máy/bảo trì, vật tư/kho, chi phí/mua hàng.
const STARTER_GROUPS: { label: string; color: string; items: { icon: React.ReactNode; text: string }[] }[] = [
    {
        label: 'Máy & bảo trì',
        color: '#6366f1',
        items: [
            { icon: <AppstoreOutlined />, text: 'Có đơn cần máy 1 kim Hikari, còn máy nào rảnh không?' },
            { icon: <TrophyOutlined />, text: 'Top 5 máy hỏng nhiều nhất' },
            { icon: <EnvironmentOutlined />, text: 'Máy nào lệch vị trí GPS?' },
        ],
    },
    {
        label: 'Vật tư & kho',
        color: '#10b981',
        items: [
            { icon: <ToolOutlined />, text: 'Vật tư nào sắp hết?' },
            { icon: <AppstoreOutlined />, text: 'Vật tư nào cấp phát nhiều nhất ở các cơ sở?' },
        ],
    },
    {
        label: 'Chi phí & mua hàng',
        color: '#f59e0b',
        items: [
            { icon: <DollarOutlined />, text: 'Phân tích chi phí mua vật tư tháng này so với tháng trước' },
            { icon: <FileTextOutlined />, text: 'Đề xuất mua sắm cho tuần tới' },
            { icon: <ShoppingOutlined />, text: 'Xem các đơn hàng vật tư gần đây' },
        ],
    },
];

// Các bước "đang suy nghĩ" xoay vòng (agentic chạy vài giây) — tạo cảm giác đang làm việc thật.
const THINKING_STEPS = ['Đang phân tích câu hỏi…', 'Đang truy vấn dữ liệu thật…', 'Đang tổng hợp kết quả…'];

// Nhãn + màu theo mảng dữ liệu của câu trả lời.
const DOMAIN_BADGE: Record<string, { label: string; color: string }> = {
    asset: { label: 'Máy móc', color: '#6366f1' },
    material: { label: 'Vật tư', color: '#10b981' },
    cost: { label: 'Chi phí', color: '#f59e0b' },
};

const STYLES = `
@keyframes hd-msg-in { from { opacity:0; transform: translateY(12px) scale(.98); } to { opacity:1; transform:none; } }
.hd-msg { animation: hd-msg-in .32s cubic-bezier(.22,1,.36,1) both; }
@keyframes hd-pop { 0% { opacity:0; transform: scale(.92) translateY(6px); } 60% { transform: scale(1.015); } 100% { opacity:1; transform:none; } }
.hd-pop { animation: hd-pop .28s cubic-bezier(.34,1.56,.64,1) both; }
@keyframes hd-dot { 0%,80%,100% { transform: scale(.5); opacity:.35; } 40% { transform: scale(1); opacity:1; } }
.hd-typing span { animation: hd-dot 1.1s infinite ease-in-out; }
.hd-typing span:nth-child(2) { animation-delay: .15s; }
.hd-typing span:nth-child(3) { animation-delay: .3s; }
@keyframes hd-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
.hd-float { animation: hd-float 3.6s ease-in-out infinite; }
@keyframes hd-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,.45); } 50% { box-shadow: 0 0 0 7px rgba(99,102,241,0); } }
.hd-glow { animation: hd-glow 2.6s ease-in-out infinite; }
@keyframes hd-grad { 0% { background-position:0% 50%; } 50% { background-position:100% 50%; } 100% { background-position:0% 50%; } }
.hd-grad { background-size: 220% 220%; animation: hd-grad 7s ease infinite; }
@keyframes hd-caret { 0%,100% { opacity:1; } 50% { opacity:0; } }
.hd-caret { display:inline-block; width:2px; height:1em; margin-left:2px; vertical-align:-2px; background: linear-gradient(180deg,#2563eb,#7c3aed); animation: hd-caret .9s step-end infinite; border-radius:2px; }
.hd-stagger > * { animation: hd-msg-in .34s cubic-bezier(.22,1,.36,1) both; }
.hd-stagger > *:nth-child(1){animation-delay:.03s;} .hd-stagger > *:nth-child(2){animation-delay:.07s;}
.hd-stagger > *:nth-child(3){animation-delay:.11s;} .hd-stagger > *:nth-child(4){animation-delay:.15s;}
.hd-stagger > *:nth-child(5){animation-delay:.19s;} .hd-stagger > *:nth-child(6){animation-delay:.23s;}
.hd-stagger > *:nth-child(7){animation-delay:.27s;} .hd-stagger > *:nth-child(8){animation-delay:.31s;}
.hd-scroll::-webkit-scrollbar { width: 6px; }
.hd-scroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,.28); border-radius: 99px; }
.hd-scroll::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,.45); }
.hd-lift { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.hd-lift:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15,23,42,.08); }
@media (prefers-reduced-motion: reduce) {
  .hd-msg,.hd-pop,.hd-typing span,.hd-float,.hd-glow,.hd-grad,.hd-caret,.hd-stagger > *,.hd-lift { animation: none !important; transition: none !important; }
}
`;

// Hiệu ứng chữ chạy (chỉ cho tin nhắn mới); tin cũ hiển thị ngay.
const TypewriterText: React.FC<{ text: string; animate?: boolean }> = ({ text, animate }) => {
    const [shown, setShown] = useState(animate ? '' : text);
    useEffect(() => {
        if (!animate) {
            setShown(text);
            return;
        }
        setShown('');
        let i = 0;
        const step = Math.max(1, Math.round(text.length / 110));
        const id = window.setInterval(() => {
            i += step;
            setShown(text.slice(0, i));
            if (i >= text.length) window.clearInterval(id);
        }, 16);
        return () => window.clearInterval(id);
    }, [text, animate]);
    return (
        <>
            {shown}
            {shown.length < text.length ? <span className='hd-caret' /> : null}
        </>
    );
};

// Báo "đang suy nghĩ" với dòng trạng thái xoay vòng.
const ThinkingIndicator: React.FC = () => {
    const [step, setStep] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => setStep((s) => (s + 1) % THINKING_STEPS.length), 1400);
        return () => window.clearInterval(id);
    }, []);
    return (
        <div className='flex items-center gap-2 rounded-3xl rounded-tl-md border border-slate-200/70 bg-white px-4 py-3 shadow-sm'>
            <span className='hd-typing flex items-center gap-1'>
                <span className='h-1.5 w-1.5 rounded-full bg-blue-400' />
                <span className='h-1.5 w-1.5 rounded-full bg-indigo-400' />
                <span className='h-1.5 w-1.5 rounded-full bg-fuchsia-400' />
            </span>
            <span key={step} className='hd-msg text-[12px] font-medium text-slate-400'>
                {THINKING_STEPS[step]}
            </span>
        </div>
    );
};

interface Props {
    open: boolean;
    onClose: () => void;
}

const AssetAssistantDrawer: React.FC<Props> = ({ open, onClose }) => {
    const navigate = useNavigate();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat());
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Giữ phiên qua chuyển trang / reload.
    useEffect(() => {
        saveChat(messages);
    }, [messages]);

    const startNewChat = () => {
        setMessages([]);
        setInput('');
        try {
            localStorage.removeItem(CHAT_KEY);
        } catch {
            /* noop */
        }
    };

    const send = async (text: string) => {
        const q = text.trim();
        if (!q || loading) return;
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages((prev) => [...prev, { role: 'user', content: q }]);
        setInput('');
        setLoading(true);
        try {
            const resp = await operationsAssistantService.ask([...history, { role: 'user', content: q }]);
            setMessages((prev) => [...prev, { role: 'assistant', content: resp.answer, data: resp, animate: true }]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Xin lỗi, mình chưa xử lý được câu này. Thử hỏi lại nhé.' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    // Áp bộ lọc -> điều hướng tới danh sách máy kèm query (toàn cục, không phụ thuộc trang đang đứng).
    const applyToList = (f: AssistantAppliedFilters) => {
        const params = new URLSearchParams();
        if (f.search) params.set('search', f.search);
        if (f.status?.[0]) params.set('status', f.status[0]);
        if (f.ownershipType?.[0]) params.set('ownershipType', f.ownershipType[0]);
        if (f.plantId) params.set('plantId', f.plantId);
        if (f.brandId) params.set('brandId', f.brandId);
        navigate(`/assets?${params.toString()}`);
        onClose();
    };

    const openAsset = (id: string) => {
        navigate(`/assets/${id}`);
        onClose();
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement={isMobile ? 'bottom' : 'right'}
            width={isMobile ? '100%' : 480}
            height={isMobile ? '90vh' : undefined}
            closable={false}
            styles={{
                body: { padding: 0, display: 'flex', flexDirection: 'column', background: '#f8fafc' },
                header: { display: 'none' },
                content: isMobile ? { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' } : {},
            }}
        >
            <style>{STYLES}</style>

            {/* Header */}
            <div className='flex items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur'>
                <span className='hd-grad hd-glow flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-fuchsia-600 text-white shadow-[0_6px_16px_rgba(37,99,235,0.32)]'>
                    <RobotOutlined className='text-lg' />
                </span>
                <div className='min-w-0 flex-1'>
                    <div className='text-[15px] font-bold text-slate-900'>Trợ lý vận hành</div>
                    <div className='flex items-center gap-1.5 text-[11px] text-slate-500'>
                        <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
                        Hỏi đáp máy · bảo trì · vật tư · chi phí
                    </div>
                </div>
                {messages.length ? (
                    <Tooltip title='Trò chuyện mới'>
                        <Button
                            type='text'
                            shape='circle'
                            icon={<FormOutlined />}
                            onClick={startNewChat}
                            className='text-slate-400 hover:!text-blue-600'
                        />
                    </Tooltip>
                ) : null}
                <Button
                    type='text'
                    shape='circle'
                    icon={<CloseOutlined />}
                    onClick={onClose}
                    className='text-slate-400'
                />
            </div>

            {/* Messages */}
            <div className='hd-scroll flex-1 space-y-4 overflow-y-auto px-3.5 py-4 sm:px-4'>
                {messages.length === 0 ? (
                    <div className='hd-msg mt-2'>
                        <div className='flex flex-col items-center text-center'>
                            <span className='hd-float hd-grad flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-fuchsia-600 text-2xl text-white shadow-[0_10px_24px_rgba(37,99,235,0.3)]'>
                                <RobotOutlined />
                            </span>
                            <div className='mt-3 text-[15px] font-bold text-slate-800'>Chào bạn 👋</div>
                            <div className='mt-1 max-w-[290px] text-[13px] leading-5 text-slate-500'>
                                Hỏi mình về máy móc, vật tư hay chi phí — mình truy vấn dữ liệu thật rồi trả lời.
                            </div>
                        </div>
                        <div className='mt-5 space-y-3.5'>
                            {STARTER_GROUPS.map((g) => (
                                <div key={g.label}>
                                    <div className='mb-1.5 flex items-center gap-1.5 px-1'>
                                        <span className='h-1.5 w-1.5 rounded-full' style={{ background: g.color }} />
                                        <span className='text-[11px] font-semibold tracking-wide text-slate-400 uppercase'>
                                            {g.label}
                                        </span>
                                    </div>
                                    <div className='hd-stagger grid grid-cols-1 gap-2'>
                                        {g.items.map((s) => (
                                            <button
                                                key={s.text}
                                                type='button'
                                                onClick={() => send(s.text)}
                                                className='flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[12.5px] font-medium text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:text-slate-900 hover:shadow-md'
                                            >
                                                <span
                                                    className='flex h-7 w-7 shrink-0 items-center justify-center rounded-xl'
                                                    style={{ background: `${g.color}1a`, color: g.color }}
                                                >
                                                    {s.icon}
                                                </span>
                                                <span className='min-w-0'>{s.text}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {messages.map((m, i) =>
                    m.role === 'user' ? (
                        <div key={i} className='hd-msg flex justify-end'>
                            <div className='hd-pop max-w-[82%] rounded-3xl rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 px-4 py-2.5 text-[13.5px] leading-relaxed text-white shadow-[0_4px_14px_rgba(37,99,235,0.28)]'>
                                {m.content}
                            </div>
                        </div>
                    ) : (
                        <div key={i} className='hd-msg flex gap-2.5'>
                            <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'>
                                <RobotOutlined className='text-sm' />
                            </span>
                            <div className='min-w-0 flex-1 space-y-2'>
                                <div className='rounded-3xl rounded-tl-md border border-slate-200/70 bg-white px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-slate-700 shadow-sm'>
                                    <TypewriterText text={m.content} animate={m.animate} />
                                </div>
                                {m.data ? (
                                    <AssistantResult
                                        data={m.data}
                                        onOpen={openAsset}
                                        onApply={applyToList}
                                        onAsk={send}
                                    />
                                ) : null}
                            </div>
                        </div>
                    )
                )}

                {loading ? (
                    <div className='hd-msg flex gap-2.5'>
                        <span className='hd-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'>
                            <RobotOutlined className='text-sm' />
                        </span>
                        <ThinkingIndicator />
                    </div>
                ) : null}
                <div ref={endRef} />
            </div>

            {/* Composer */}
            <div
                className='border-t border-slate-200/70 bg-white px-3 py-3'
                style={{ paddingBottom: isMobile ? 'calc(0.75rem + env(safe-area-inset-bottom))' : undefined }}
            >
                <div className='flex items-end gap-2 rounded-3xl border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm transition-all focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]'>
                    <Input.TextArea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 5 }}
                        variant='borderless'
                        className='!bg-transparent !px-0 !py-1.5 text-[13.5px]'
                        placeholder='Hỏi về máy móc...'
                        onPressEnter={(e) => {
                            if (!e.shiftKey) {
                                e.preventDefault();
                                send(input);
                            }
                        }}
                    />
                    <Button
                        type='primary'
                        shape='circle'
                        icon={<SendOutlined />}
                        loading={loading}
                        disabled={!input.trim()}
                        onClick={() => send(input)}
                        className='hd-grad mb-1 shrink-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-fuchsia-600 transition-transform hover:scale-110 active:scale-95'
                    />
                </div>
                <div className='mt-1.5 text-center text-[10.5px] text-slate-400'>
                    Trợ lý truy vấn dữ liệu thật · Enter để gửi, Shift+Enter xuống dòng
                </div>
            </div>
        </Drawer>
    );
};

const AssistantResult: React.FC<{
    data: AssetAssistantResponse;
    onOpen: (id: string) => void;
    onApply: (f: AssistantAppliedFilters) => void;
    onAsk: (q: string) => void;
}> = ({ data, onOpen, onApply, onAsk }) => {
    // Phòng vệ: tin nhắn cũ lưu trong localStorage có thể thiếu trường -> luôn dùng mảng/đối tượng mặc định.
    const aggregates = data.aggregates ?? {};
    const items = data.items ?? [];
    const count = data.count ?? 0;
    const followups = data.followups ?? [];
    const hasStats = count > 0 || aggregates.totalValue != null;
    const variance = aggregates.variance;
    const drivers = variance?.drivers ?? [];
    const fmtV = (v: number, isCost: boolean) => (isCost ? `${Math.round(v).toLocaleString('vi-VN')}đ` : `${v}`);
    const fmtD = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;
    const maxDelta = drivers.length ? Math.max(1, ...drivers.map((d) => Math.abs(d.delta))) : 1;
    const usageByPlant = aggregates.usageByPlant;
    const purchaseAnalysis = aggregates.purchaseAnalysis;
    const purchaseOrders = aggregates.purchaseOrders;
    const priceHistory = aggregates.priceHistory;
    const supplierComparison = aggregates.supplierComparison;
    const distributionAnalysis = aggregates.distributionAnalysis;
    const purchaseSuggestion = aggregates.purchaseSuggestion;
    const maxPurchase = purchaseAnalysis?.rows?.length
        ? Math.max(1, ...purchaseAnalysis.rows.map((x) => x.current))
        : 1;
    const maxPricePoint = priceHistory?.points?.length
        ? Math.max(1, ...priceHistory.points.map((p) => p.unitPrice))
        : 1;
    const hasContent =
        hasStats ||
        !!variance ||
        !!purchaseAnalysis ||
        !!usageByPlant?.materials?.length ||
        !!purchaseOrders?.orders?.length ||
        !!priceHistory?.count ||
        !!supplierComparison?.suppliers?.length ||
        !!distributionAnalysis ||
        !!purchaseSuggestion?.suggestions?.length ||
        !!aggregates.topBroken?.length ||
        !!aggregates.breakdown?.length ||
        items.length > 0;
    const badge = data.domain ? DOMAIN_BADGE[data.domain] : undefined;

    return (
        <div className='hd-stagger space-y-2'>
            {badge && hasContent ? (
                <div>
                    <span
                        className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold'
                        style={{ background: `${badge.color}1a`, color: badge.color }}
                    >
                        <span className='h-1.5 w-1.5 rounded-full' style={{ background: badge.color }} />
                        {badge.label}
                    </span>
                </div>
            ) : null}

            {hasStats ? (
                <div className='flex flex-wrap gap-2'>
                    <div className='flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 py-1.5 shadow-sm'>
                        <span className='text-[11px] text-slate-400'>Kết quả</span>
                        <span className='text-base font-bold text-slate-800'>{count}</span>
                        <span className='text-[11px] text-slate-400'>
                            {data.domain === 'asset' ? 'máy' : data.domain === 'material' ? 'mục' : 'kết quả'}
                        </span>
                    </div>
                    {aggregates.totalValue != null ? (
                        <div className='flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-1.5'>
                            <span className='text-[11px] text-emerald-600'>Tổng giá trị</span>
                            <span className='text-sm font-bold text-emerald-700'>
                                {aggregates.totalValue.toLocaleString('vi-VN')}đ
                            </span>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {variance ? (
                <div className='rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm'>
                    <div className='flex flex-wrap items-end gap-2'>
                        <div>
                            <div className='text-[11px] text-slate-400'>{variance.metricLabel} kỳ này</div>
                            <div className='text-base font-bold text-slate-800'>
                                {fmtV(variance.current, variance.isCost)}
                            </div>
                        </div>
                        <span
                            className={`mb-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                variance.deltaPct >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                            }`}
                        >
                            {variance.deltaPct >= 0 ? '+' : ''}
                            {variance.deltaPct}%
                        </span>
                        <div className='mb-0.5 text-[11px] text-slate-400'>
                            kỳ trước {fmtV(variance.previous, variance.isCost)}
                        </div>
                    </div>
                    {drivers.slice(0, 4).map((d) => {
                        const pos = d.delta >= 0;
                        return (
                            <div key={d.label} className='mt-1.5 flex items-center gap-2 text-[12px]'>
                                <span className='w-24 shrink-0 truncate text-slate-600'>{d.label}</span>
                                <div className='h-1.5 flex-1 rounded-full bg-slate-100'>
                                    <div
                                        className={`h-1.5 rounded-full ${pos ? 'bg-rose-400' : 'bg-emerald-400'}`}
                                        style={{ width: `${(Math.abs(d.delta) / maxDelta) * 100}%` }}
                                    />
                                </div>
                                <span
                                    className={`w-20 shrink-0 text-right font-medium ${pos ? 'text-rose-600' : 'text-emerald-600'}`}
                                >
                                    {pos ? '+' : ''}
                                    {fmtV(d.delta, variance.isCost)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {purchaseAnalysis ? (
                <div className='rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm'>
                    <div className='mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400'>
                        <DollarOutlined style={{ color: '#f59e0b' }} />
                        Mua vật tư · phân rã theo {purchaseAnalysis.groupBy === 'supplier' ? 'nhà cung cấp' : 'vật tư'}
                    </div>
                    <div className='flex flex-wrap items-end gap-2'>
                        <div>
                            <div className='text-[11px] text-slate-400'>{purchaseAnalysis.periodLabel}</div>
                            <div className='text-base font-bold text-slate-800'>{fmtD(purchaseAnalysis.current)}</div>
                        </div>
                        <span
                            className={`mb-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                purchaseAnalysis.deltaPct >= 0
                                    ? 'bg-rose-50 text-rose-600'
                                    : 'bg-emerald-50 text-emerald-600'
                            }`}
                        >
                            {purchaseAnalysis.deltaPct >= 0 ? '+' : ''}
                            {purchaseAnalysis.deltaPct}%
                        </span>
                        <div className='mb-0.5 text-[11px] text-slate-400'>
                            {purchaseAnalysis.prevLabel} {fmtD(purchaseAnalysis.previous)}
                        </div>
                    </div>
                    {purchaseAnalysis.rows.slice(0, 6).map((r) => {
                        const pos = r.delta >= 0;
                        return (
                            <div key={r.label} className='mt-1.5 text-[12px]'>
                                <div className='flex items-center gap-2'>
                                    <span className='min-w-0 flex-1 truncate text-slate-600'>{r.label}</span>
                                    <span className='shrink-0 font-semibold text-slate-800'>{fmtD(r.current)}</span>
                                    {r.delta !== 0 ? (
                                        <span
                                            className={`w-16 shrink-0 text-right text-[11px] font-medium ${pos ? 'text-rose-500' : 'text-emerald-500'}`}
                                        >
                                            {pos ? '+' : ''}
                                            {fmtD(r.delta)}
                                        </span>
                                    ) : (
                                        <span className='w-16 shrink-0' />
                                    )}
                                </div>
                                <div className='mt-0.5 h-1.5 rounded-full bg-slate-100'>
                                    <div
                                        className='h-1.5 rounded-full bg-blue-400'
                                        style={{ width: `${(r.current / maxPurchase) * 100}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {usageByPlant?.materials?.length ? (
                <div className='overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm'>
                    <div className='flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-1.5'>
                        <span className='flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11px] font-medium text-slate-500'>
                            <AppstoreOutlined style={{ color: '#10b981' }} />
                            <span className='truncate'>
                                Cấp phát nhiều nhất
                                {usageByPlant.plantName ? ` · ${usageByPlant.plantName}` : ' theo cơ sở'} ·{' '}
                                {usageByPlant.periodLabel}
                            </span>
                        </span>
                        <span className='shrink-0 text-[11px] font-semibold text-emerald-600'>
                            {fmtD(usageByPlant.totalValue)}
                        </span>
                    </div>
                    {usageByPlant.materials.map((m, idx) => (
                        <div
                            key={`${m.materialName}-${idx}`}
                            className='border-b border-slate-100 px-3 py-2 last:border-0'
                        >
                            <div className='flex items-center gap-2 text-[12.5px]'>
                                <span className='min-w-0 flex-1 truncate font-medium text-slate-700'>
                                    {m.materialName}
                                </span>
                                <span className='shrink-0 text-slate-500'>
                                    {m.totalQty} {m.unit}
                                </span>
                                <span className='w-20 shrink-0 text-right font-semibold text-slate-800'>
                                    {fmtD(m.totalValue)}
                                </span>
                            </div>
                            {m.plants?.length ? (
                                <div className='mt-1 flex flex-wrap gap-1'>
                                    {m.plants.slice(0, 5).map((p) => (
                                        <span
                                            key={p.plantName}
                                            className='rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-500'
                                        >
                                            {p.plantName} ·{' '}
                                            <b className='text-slate-700'>
                                                {p.qty} {m.unit}
                                            </b>
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}

            {purchaseOrders?.orders?.length ? (
                <div className='space-y-1.5'>
                    <div className='flex items-center gap-1.5 px-1'>
                        <ShoppingOutlined style={{ color: '#f59e0b' }} />
                        <span className='text-[11px] font-semibold text-slate-400'>
                            Đơn hàng vật tư{purchaseOrders.detail ? ' · chi tiết' : ` · ${count} đơn`}
                        </span>
                    </div>
                    {purchaseOrders.orders.slice(0, purchaseOrders.detail ? 3 : 10).map((o, idx) => (
                        <div
                            key={`${o.orderCode}-${idx}`}
                            className='overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm'
                        >
                            <div className='flex items-center gap-2 px-3 py-2 text-[12.5px]'>
                                <span className='min-w-0 flex-1 truncate'>
                                    <b className='text-slate-800'>{o.orderCode}</b>
                                    <span className='text-slate-400'> · {o.supplierName}</span>
                                    {o.plantName ? <span className='text-slate-400'> · {o.plantName}</span> : null}
                                </span>
                                <Tag className='!m-0 !rounded-full !border-slate-200 !bg-slate-50 !text-[10.5px]'>
                                    {o.statusLabel}
                                </Tag>
                                <span className='shrink-0 font-semibold text-slate-800'>{fmtD(o.totalWithVat)}</span>
                            </div>
                            {o.items?.length ? (
                                <div className='border-t border-slate-100 bg-slate-50/50'>
                                    {o.items.map((it, i) => (
                                        <div
                                            key={`${it.materialName}-${i}`}
                                            className='flex items-center gap-2 px-3 py-1 text-[11.5px]'
                                        >
                                            <span className='min-w-0 flex-1 truncate text-slate-600'>
                                                {it.materialName}
                                            </span>
                                            <span className='shrink-0 text-slate-400'>
                                                {it.quantityOrdered} {it.unit}
                                            </span>
                                            <span className='w-20 shrink-0 text-right text-slate-500'>
                                                {fmtD(it.totalWithVat)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className='border-t border-slate-100 px-3 py-1 text-[11px] text-slate-400'>
                                    {o.itemCount} dòng vật tư
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            {priceHistory?.count ? (
                <div className='rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm'>
                    <div className='mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400'>
                        <DollarOutlined style={{ color: '#f59e0b' }} />
                        Lịch sử giá · {priceHistory.materialName}
                    </div>
                    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]'>
                        <span className='text-slate-500'>
                            TB <b className='text-slate-800'>{fmtD(priceHistory.avgPrice)}</b>
                        </span>
                        <span className='text-slate-400'>thấp {fmtD(priceHistory.minPrice)}</span>
                        <span className='text-slate-400'>cao {fmtD(priceHistory.maxPrice)}</span>
                        {priceHistory.trendPct !== 0 ? (
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    priceHistory.trendPct > 0
                                        ? 'bg-rose-50 text-rose-600'
                                        : 'bg-emerald-50 text-emerald-600'
                                }`}
                            >
                                {priceHistory.trendPct > 0 ? '↑' : '↓'} {Math.abs(priceHistory.trendPct)}%
                            </span>
                        ) : null}
                    </div>
                    {priceHistory.points.slice(-8).map((p, i) => (
                        <div key={`${p.orderCode}-${i}`} className='mt-1.5 flex items-center gap-2 text-[11.5px]'>
                            <span className='w-24 shrink-0 truncate text-slate-500'>{p.supplierName}</span>
                            <div className='h-1.5 flex-1 rounded-full bg-slate-100'>
                                <div
                                    className='h-1.5 rounded-full bg-amber-400'
                                    style={{ width: `${(p.unitPrice / maxPricePoint) * 100}%` }}
                                />
                            </div>
                            <span className='w-20 shrink-0 text-right font-medium text-slate-700'>
                                {fmtD(p.unitPrice)}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            {supplierComparison?.suppliers?.length ? (
                <div className='overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm'>
                    <div className='flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/60 px-3 py-1.5 text-[11px] font-medium text-slate-500'>
                        <ShoppingOutlined style={{ color: '#f59e0b' }} />
                        So sánh giá NCC · {supplierComparison.materialName}
                    </div>
                    {supplierComparison.suppliers.map((s, i) => (
                        <div
                            key={`${s.supplierName}-${i}`}
                            className='flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-[12.5px] last:border-0'
                        >
                            {i === 0 ? (
                                <Tag color='green' className='!m-0 !rounded-full !text-[10px]'>
                                    rẻ nhất
                                </Tag>
                            ) : (
                                <span className='w-1' />
                            )}
                            <span className='min-w-0 flex-1 truncate font-medium text-slate-700'>{s.supplierName}</span>
                            <span className='shrink-0 text-slate-400'>{s.orders} đơn</span>
                            <span className='w-24 shrink-0 text-right font-semibold text-slate-800'>
                                {fmtD(s.avgPrice)}
                                <span className='text-[10px] font-normal text-slate-400'>/{s.unit}</span>
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            {distributionAnalysis ? (
                <div className='rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm'>
                    <div className='mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400'>
                        <AppstoreOutlined style={{ color: '#10b981' }} />
                        Cấp phát {distributionAnalysis.plantName ? `· ${distributionAnalysis.plantName} ` : ''}·{' '}
                        {distributionAnalysis.periodLabel}
                    </div>
                    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]'>
                        <span className='text-slate-500'>
                            Tổng <b className='text-emerald-700'>{fmtD(distributionAnalysis.totalValue)}</b>
                        </span>
                        {distributionAnalysis.totalShortageQty > 0 ? (
                            <span className='rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600'>
                                thiếu {distributionAnalysis.totalShortageQty} ({distributionAnalysis.totalShortageLines}{' '}
                                dòng)
                            </span>
                        ) : (
                            <span className='rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600'>
                                đủ, không thiếu
                            </span>
                        )}
                    </div>
                    {distributionAnalysis.topMaterials.slice(0, 5).map((m, i) => (
                        <div key={`${m.materialName}-${i}`} className='mt-1 flex items-center gap-2 text-[12px]'>
                            <span className='min-w-0 flex-1 truncate text-slate-600'>{m.materialName}</span>
                            <span className='shrink-0 text-slate-400'>
                                {m.qty} {m.unit}
                            </span>
                            <span className='w-20 shrink-0 text-right font-medium text-slate-700'>{fmtD(m.value)}</span>
                        </div>
                    ))}
                    {distributionAnalysis.topShortages.length ? (
                        <div className='mt-1.5 flex flex-wrap gap-1'>
                            {distributionAnalysis.topShortages.slice(0, 5).map((s) => (
                                <span
                                    key={s.materialName}
                                    className='rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] text-rose-500'
                                >
                                    {s.materialName} thiếu <b>{s.shortageQty}</b>
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {purchaseSuggestion?.suggestions?.length ? (
                <div className='overflow-hidden rounded-2xl border border-amber-200/70 bg-amber-50/40 shadow-sm'>
                    <div className='flex items-center gap-1.5 border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700'>
                        <FileTextOutlined /> Đề xuất mua sắm · {purchaseSuggestion.count} vật tư
                    </div>
                    {purchaseSuggestion.suggestions.slice(0, 10).map((s, i) => (
                        <div
                            key={`${s.materialName}-${i}`}
                            className='flex items-center gap-2 border-b border-amber-100/60 px-3 py-2 text-[12.5px] last:border-0'
                        >
                            <span className='min-w-0 flex-1 truncate font-medium text-slate-700'>{s.materialName}</span>
                            <span className='shrink-0 text-[11px] text-slate-400'>
                                tồn {s.stock}/{s.minLevel}
                            </span>
                            <span className='shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700'>
                                mua {s.suggestQty} {s.unit}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            {aggregates.breakdown?.length ? (
                <div className='flex flex-wrap gap-1.5'>
                    {aggregates.breakdown.map((b) => (
                        <Tag key={b.key} className='!m-0 !rounded-full !border-slate-200 !bg-white !px-2.5 !py-0.5'>
                            {b.label} · <b className='text-slate-800'>{b.count}</b>
                        </Tag>
                    ))}
                </div>
            ) : null}

            {aggregates.topBroken?.length ? (
                <div className='overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm'>
                    {aggregates.topBroken.map((t, idx) => (
                        <button
                            key={t.id}
                            type='button'
                            onClick={() => onOpen(t.id)}
                            className='flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-left text-[12.5px] transition-colors last:border-0 hover:bg-blue-50/50'
                        >
                            <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                    idx === 0
                                        ? 'bg-amber-100 text-amber-700'
                                        : idx === 1
                                          ? 'bg-slate-200 text-slate-600'
                                          : idx === 2
                                            ? 'bg-orange-100 text-orange-700'
                                            : 'bg-slate-100 text-slate-500'
                                }`}
                            >
                                {idx + 1}
                            </span>
                            <span className='min-w-0 flex-1 truncate font-medium text-slate-700'>
                                {t.machineCode || t.name}
                                {t.plantName ? (
                                    <span className='font-normal text-slate-400'> · {t.plantName}</span>
                                ) : null}
                            </span>
                            <Tag color='red' className='!m-0 !rounded-full'>
                                {t.count} lần
                            </Tag>
                        </button>
                    ))}
                </div>
            ) : null}

            {items.length ? (
                <div className='overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm'>
                    {items.slice(0, 8).map((it) => {
                        const meta = getAssetStatusColor(it.status as AssetStatus);
                        return (
                            <button
                                key={it.id}
                                type='button'
                                onClick={() => (data.domain === 'asset' ? onOpen(it.id) : undefined)}
                                className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-[12.5px] transition-colors last:border-0 ${
                                    data.domain === 'asset' ? 'hover:bg-blue-50/50' : 'cursor-default'
                                }`}
                            >
                                <span className='h-2 w-2 shrink-0 rounded-full' style={{ background: meta.color }} />
                                <span className='min-w-0 flex-1 truncate'>
                                    <b className='text-slate-800'>{it.machineCode}</b>{' '}
                                    <span className='text-slate-500'>{it.name}</span>
                                    {it.plantName ? <span className='text-slate-400'> · {it.plantName}</span> : null}
                                </span>
                                {it.mislocated ? (
                                    <ThunderboltOutlined className='shrink-0 text-rose-500' title='Lệch vị trí' />
                                ) : null}
                                <span
                                    className='shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold'
                                    style={{ background: `${meta.color}1a`, color: meta.color }}
                                >
                                    {it.statusLabel}
                                </span>
                            </button>
                        );
                    })}
                    {data.domain === 'asset' && data.appliedFilters && count > 0 ? (
                        <button
                            type='button'
                            onClick={() => onApply(data.appliedFilters!)}
                            className='w-full bg-slate-50 px-3 py-2 text-center text-[12px] font-semibold text-blue-600 transition-colors hover:bg-blue-50'
                        >
                            Áp {count} máy vào danh sách →
                        </button>
                    ) : null}
                </div>
            ) : null}

            {followups.length ? (
                <div className='flex flex-wrap gap-1.5 pt-0.5'>
                    {followups.map((f) => (
                        <button
                            key={f}
                            type='button'
                            onClick={() => onAsk(f)}
                            className='rounded-full border border-blue-200 bg-blue-50/50 px-2.5 py-1 text-[11.5px] font-medium text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-50'
                        >
                            {f}
                        </button>
                    ))}
                </div>
            ) : null}

            {data.model ? (
                <div className='pt-0.5 text-[10.5px] text-slate-400'>
                    {data.tier === 'light'
                        ? '⚡ tiết kiệm'
                        : data.tier === 'heavy'
                          ? '🧠 phân tích sâu'
                          : '◆ tiêu chuẩn'}{' '}
                    · {data.model}
                </div>
            ) : null}
        </div>
    );
};

export default AssetAssistantDrawer;

import { useMemo } from 'react';
import { Collapse, Typography } from 'antd';
import { AndroidOutlined, AppleOutlined, DesktopOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

type Platform = 'ios' | 'android' | 'desktop';

const detectPlatform = (): Platform => {
    if (typeof navigator === 'undefined') return 'desktop';

    const ua = navigator.userAgent.toLowerCase();
    const nav = navigator as Navigator & { maxTouchPoints?: number };

    // iPadOS mới báo UA là macintosh nhưng có cảm ứng
    if (/iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && (nav.maxTouchPoints ?? 0) > 1)) {
        return 'ios';
    }
    if (/android/.test(ua)) return 'android';
    return 'desktop';
};

const Step = ({ children }: { children: React.ReactNode }) => (
    <li className='text-[12px] leading-5 text-slate-600'>{children}</li>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className='mt-2 first:mt-0'>
        <Text className='block text-[11px] font-bold tracking-wide text-slate-500 uppercase'>{title}</Text>
        <ol className='mt-1 ml-4 list-decimal space-y-1'>{children}</ol>
    </div>
);

const guides: Record<Platform, { label: string; icon: React.ReactNode; content: React.ReactNode }> = {
    android: {
        label: 'Android',
        icon: <AndroidOutlined className='text-green-600' />,
        content: (
            <>
                <Section title='Cài app vào máy'>
                    <Step>Mở hệ thống bằng trình duyệt Chrome.</Step>
                    <Step>
                        Bấm menu <Text strong>⋮</Text> góc trên phải → chọn <Text strong>Cài đặt ứng dụng</Text> (hoặc{' '}
                        <Text strong>Thêm vào màn hình chính</Text>).
                    </Step>
                    <Step>Mở app từ icon vừa tạo để nhận thông báo ổn định hơn.</Step>
                </Section>
                <Section title='Đổi chuông khi app đóng'>
                    <Step>
                        Vào <Text strong>Cài đặt máy → Ứng dụng</Text> → chọn app vừa cài (hoặc{' '}
                        <Text strong>Chrome</Text> nếu chưa cài).
                    </Step>
                    <Step>
                        Chọn <Text strong>Thông báo</Text> → mở kênh thông báo → mục <Text strong>Âm thanh</Text> chọn
                        chuông bạn thích.
                    </Step>
                    <Step>Kiểm tra máy không ở chế độ Im lặng / Không làm phiền.</Step>
                </Section>
            </>
        ),
    },
    ios: {
        label: 'iPhone / iPad',
        icon: <AppleOutlined className='text-slate-700' />,
        content: (
            <>
                <Section title='Cài app vào máy (bắt buộc để nhận thông báo)'>
                    <Step>
                        Mở hệ thống bằng <Text strong>Safari</Text> (không dùng Chrome trên iPhone).
                    </Step>
                    <Step>
                        Bấm nút <Text strong>Chia sẻ</Text> (ô vuông có mũi tên) → chọn{' '}
                        <Text strong>Thêm vào MH chính</Text>.
                    </Step>
                    <Step>Mở app từ icon ngoài màn hình chính, rồi bật thông báo trong app.</Step>
                </Section>
                <Section title='Đổi chuông khi app đóng'>
                    <Step>
                        Vào <Text strong>Cài đặt → Thông báo</Text> → tìm tên app trong danh sách.
                    </Step>
                    <Step>
                        Bật <Text strong>Cho phép thông báo</Text> và mục <Text strong>Âm thanh</Text>.
                    </Step>
                    <Step>
                        Gạt <Text strong>nút Im lặng</Text> cạnh máy về chế độ chuông, tắt{' '}
                        <Text strong>Chế độ tập trung</Text> nếu đang bật.
                    </Step>
                </Section>
            </>
        ),
    },
    desktop: {
        label: 'Máy tính (Windows / Mac)',
        icon: <DesktopOutlined className='text-blue-600' />,
        content: (
            <>
                <Section title='Cài app vào máy'>
                    <Step>
                        Dùng Chrome hoặc Edge, bấm icon <Text strong>Cài đặt</Text> (màn hình nhỏ có mũi tên) ở cuối
                        thanh địa chỉ.
                    </Step>
                    <Step>
                        Hoặc menu <Text strong>⋮</Text> → <Text strong>Cài đặt / Ứng dụng → Cài đặt trang này</Text>.
                    </Step>
                </Section>
                <Section title='Đổi chuông khi app đóng'>
                    <Step>
                        Windows: <Text strong>Cài đặt → Hệ thống → Thông báo</Text>, bật âm thanh thông báo cho trình
                        duyệt.
                    </Step>
                    <Step>
                        macOS: <Text strong>Cài đặt hệ thống → Thông báo</Text> → chọn trình duyệt → bật{' '}
                        <Text strong>Phát âm thanh</Text>.
                    </Step>
                    <Step>Giữ một tab của hệ thống luôn mở để nghe đúng chuông công ty.</Step>
                </Section>
            </>
        ),
    },
};

const NotificationHelpGuide = () => {
    const platform = useMemo(() => detectPlatform(), []);
    // Mở sẵn mục đúng thiết bị, hai mục còn lại xếp sau
    const order: Platform[] = useMemo(
        () => [platform, ...(['android', 'ios', 'desktop'] as Platform[]).filter((item) => item !== platform)],
        [platform]
    );

    return (
        <div className='px-4 py-3'>
            <div className='flex items-center gap-2'>
                <InfoCircleOutlined className='text-blue-600' />
                <Text className='text-[13px] font-semibold text-slate-900'>Hướng dẫn cài đặt & âm thanh</Text>
            </div>
            <p className='mt-1 mb-2 text-[11px] leading-5 text-slate-500'>
                Chuông tùy chỉnh chỉ kêu khi app đang mở. Khi app đóng hoặc đã đăng xuất, thiết bị dùng chuông mặc định
                của hệ điều hành — chỉnh theo hướng dẫn bên dưới.
            </p>

            <Collapse
                accordion
                size='small'
                defaultActiveKey={order[0]}
                items={order.map((key) => ({
                    key,
                    label: (
                        <span className='flex items-center gap-2 text-[12px] font-semibold text-slate-800'>
                            {guides[key].icon}
                            {guides[key].label}
                        </span>
                    ),
                    children: guides[key].content,
                }))}
            />
        </div>
    );
};

export default NotificationHelpGuide;

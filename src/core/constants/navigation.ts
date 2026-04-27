export type PageMeta = {
    path: string;
    title: string;
    subtitle?: string;
    breadcrumbs: string[];
    searchPlaceholder?: string;
};

export const PAGE_META: PageMeta[] = [
    {
        path: '/dashboard',
        title: 'Dashboard',
        subtitle: 'Tổng quan vận hành thiết bị, điều chuyển và bảo trì trong toàn hệ thống.',
        breadcrumbs: ['Dashboard'],
        searchPlaceholder: 'Tìm nhanh theo mã máy hoặc tên thiết bị...',
    },
    {
        path: '/assets',
        title: 'Quản Lý Thiết Bị',
        subtitle: 'Tra cứu, cập nhật, điều phối và theo dõi toàn bộ máy móc trong hệ thống.',
        breadcrumbs: ['Dashboard', 'Quản lý máy'],
        searchPlaceholder: 'Tìm theo tên máy, mã máy, serial...',
    },
    {
        path: '/assets/:id',
        title: 'Chi Tiết Thiết Bị',
        subtitle: 'Theo dõi hồ sơ, trạng thái và lịch sử hoạt động của thiết bị.',
        breadcrumbs: ['Dashboard', 'Quản lý máy', 'Chi tiết'],
        searchPlaceholder: 'Tìm theo tên máy, mã máy, serial...',
    },
    {
        path: '/brands',
        title: 'Quản Lý Nhãn Hiệu',
        subtitle: 'Danh mục nhãn hiệu máy được dùng chung trong module quản lý máy.',
        breadcrumbs: ['Dashboard', 'Quản lý máy', 'Nhãn hiệu'],
        searchPlaceholder: 'Tìm theo tên nhãn hiệu...',
    },
    {
        path: '/maintenances',
        title: 'Lịch Trình Bảo Trì',
        subtitle: 'Quản lý kế hoạch, tiến độ và lịch sử bảo trì thiết bị.',
        breadcrumbs: ['Dashboard', 'Bảo trì'],
        searchPlaceholder: 'Tìm theo phiếu bảo trì hoặc tên thiết bị...',
    },
    {
        path: '/transfers',
        title: 'Điều Chuyển Thiết Bị',
        subtitle: 'Kiểm soát luồng di chuyển thiết bị giữa các cơ sở và khu vực.',
        breadcrumbs: ['Dashboard', 'Điều chuyển'],
        searchPlaceholder: 'Tìm theo mã lệnh, tên máy, tuyến chuyển...',
    },
    {
        path: '/borrowings',
        title: 'Giao Dịch Thiết Bị',
        subtitle: 'Theo dõi luồng mượn nội bộ, mượn ngoài và thuê máy trong toàn hệ thống.',
        breadcrumbs: ['Dashboard', 'Giao dịch thiết bị'],
        searchPlaceholder: 'Tìm theo thiết bị, người mượn, đối tác...',
    },
    {
        path: '/borrowings/new',
        title: 'Tạo Giao Dịch Thiết Bị',
        subtitle: 'Khởi tạo giao dịch mượn hoặc thuê máy mới.',
        breadcrumbs: ['Dashboard', 'Giao dịch thiết bị', 'Tạo mới'],
        searchPlaceholder: 'Tìm theo thiết bị...',
    },
    {
        path: '/borrowings/:id',
        title: 'Chi Tiết Giao Dịch',
        subtitle: 'Xem đầy đủ thông tin và timeline của giao dịch thiết bị.',
        breadcrumbs: ['Dashboard', 'Giao dịch thiết bị', 'Chi tiết'],
        searchPlaceholder: 'Tìm theo thiết bị...',
    },
    {
        path: '/storage',
        title: 'Kho Và Lưu Trữ',
        subtitle: 'Theo dõi vật tư, phụ tùng và máy móc đang lưu trữ trong kho.',
        breadcrumbs: ['Dashboard', 'Kho lưu trữ'],
        searchPlaceholder: 'Tìm theo mã kho, vị trí lưu trữ, thiết bị...',
    },
    {
        path: '/plants',
        title: 'Quản Lý Cơ Sở',
        subtitle: 'Danh mục cơ sở dùng chung cho máy móc, điều chuyển và các luồng vận hành.',
        breadcrumbs: ['Dashboard', 'Cơ sở'],
        searchPlaceholder: 'Tìm theo tên cơ sở, mã cơ sở, địa chỉ...',
    },
    {
        path: '/users',
        title: 'Người Dùng Hệ Thống',
        subtitle: 'Quản lý tài khoản, vai trò và trạng thái truy cập của người dùng.',
        breadcrumbs: ['Dashboard', 'Người dùng'],
        searchPlaceholder: 'Tìm theo tên, email, số điện thoại...',
    },
];

import { Grid } from 'antd';

/**
 * Một nguồn sự thật duy nhất cho "đang ở thiết bị nào" trong module Sản lượng.
 *
 * Trước đây mỗi trang tự quyết: có trang coi mobile là `!screens.lg` (<992px),
 * trang khác lại `!screens.md` (<768px), nên ở khoảng 900px trang này đã đổi
 * bố cục còn trang kia thì chưa.
 *
 * Mốc ở đây phải khớp ĐÚNG với media query trong `src/styles/production.css`:
 *   - 767  → cỡ chữ + vùng chạm cho điện thoại
 *   - 991  → đổi bố cục sang dạng thu gọn (ẩn nav trên, hiện tab dưới, bảng → thẻ)
 *   - 1199 → vài chỗ giãn cột trên màn hẹp
 * Đổi mốc ở đây thì phải đổi cả CSS, nếu không sẽ lặp lại đúng lỗi cũ.
 */
export type Responsive = {
    /** < 768px — điện thoại: chữ to hơn, vùng chạm 44px */
    isPhone: boolean;
    /** < 992px — bố cục thu gọn (điện thoại + máy tính bảng dọc) */
    isCompact: boolean;
    /** >= 992px */
    isDesktop: boolean;
    /** >= 1200px — màn rộng, đủ chỗ cho bố cục nhiều cột */
    isWide: boolean;
};

export const useResponsive = (): Responsive => {
    const screens = Grid.useBreakpoint();
    // antd: md >= 768, lg >= 992, xl >= 1200. Lúc mới mount mọi cờ đều undefined
    // nên mặc định coi như desktop để không nháy bố cục mobile trên máy tính.
    const isPhone = screens.md === false;
    const isCompact = screens.lg === false;
    const isWide = screens.xl !== false;

    return { isPhone, isCompact, isDesktop: !isCompact, isWide };
};

export default useResponsive;

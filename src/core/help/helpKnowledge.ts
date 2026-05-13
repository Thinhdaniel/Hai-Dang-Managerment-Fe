export type HelpCategory = 'machine' | 'material' | 'report' | 'admin' | 'general';

export type HelpTopic = {
    id: string;
    title: string;
    category: HelpCategory;
    routes: string[];
    keywords: string[];
    summary: string;
    steps: string[];
    notes?: string[];
    related?: string[];
};

const normalizeText = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();

const routeMatches = (pathname: string, route: string) => {
    if (route.endsWith('/*')) {
        return pathname.startsWith(route.slice(0, -1));
    }

    return pathname === route || pathname.startsWith(`${route}/`);
};

export const HELP_TOPICS: HelpTopic[] = [
    {
        id: 'machine-create-and-import',
        title: 'Thêm hoặc import danh sách máy',
        category: 'machine',
        routes: ['/assets', '/assets/*'],
        keywords: ['them may', 'tao may', 'import may', 'excel may', 'dong bo may', 'ma may', 'serial', 'model'],
        summary:
            'Dùng khi cần đưa máy thật vào hệ thống. Mã máy nội bộ là định danh chính, serial/model chỉ là thông tin bổ sung nếu có.',
        steps: [
            'Vào Quản lý máy > Máy.',
            'Nếu nhập từng máy, bấm Thêm thiết bị và điền tối thiểu tên máy, mã máy, loại máy, model nếu hệ thống đang yêu cầu, nhãn hiệu, cơ sở và khu vực.',
            'Nếu nhập hàng loạt, bấm Import Excel, chọn file danh sách máy, xem bảng preview lỗi trước khi xác nhận.',
            'Dùng machineCode làm mã quản lý duy nhất. Mã này nên trùng với tem nội bộ hoặc mã kiểm kê đang dán ngoài thực tế.',
            'Máy không có serial thì để trống, không tự bịa serial. Máy chưa rõ model thì dùng model tạm như Chưa xác định hoặc theo loại máy cho tới khi chuẩn hóa form.',
            'Máy chưa rõ vị trí nên đưa vào cơ sở/khu vực tạm như Chưa phân bổ, Kiểm kê ban đầu hoặc Kho chờ phân loại.',
            'Sau khi import xong, kiểm tra lại bộ lọc theo cơ sở, trạng thái và tên máy để chắc danh sách đã vào đúng nhóm.',
        ],
        notes: [
            'Không nên dùng serial làm khóa chính vì nhiều máy cũ bị mất tem, không có serial hoặc serial trùng cách ghi.',
            'Nếu mã máy bị trùng, hệ thống sẽ không tạo được máy mới vì machineCode là duy nhất.',
            'Sau khi máy đã dùng trong điều chuyển, bảo trì hoặc mượn trả, hạn chế đổi machineCode để tránh lệch hồ sơ giấy và QR.',
        ],
        related: ['machine-qr-public', 'machine-status-rules', 'machine-transfer-flow'],
    },
    {
        id: 'machine-status-rules',
        title: 'Hiểu và cập nhật trạng thái máy',
        category: 'machine',
        routes: ['/assets', '/assets/*'],
        keywords: ['trang thai may', 'active', 'bao tri', 'hong', 'dang muon', 'ton kho', 'doi trang thai'],
        summary:
            'Trạng thái máy cho biết máy đang sẵn sàng, bảo trì, hỏng, đang mượn/thuê hoặc nằm kho. Một số trạng thái được cập nhật tự động bởi nghiệp vụ khác.',
        steps: [
            'Vào chi tiết máy để xem trạng thái hiện tại, vị trí, lịch sử bảo trì, lịch sử điều chuyển và giao dịch mượn trả.',
            'Dùng cập nhật trạng thái nhanh khi cần ghi nhận tình trạng vận hành thực tế: Hoạt động, Bảo trì, Hỏng, Đang mượn hoặc Tồn kho.',
            'Khi tạo giao dịch mượn/thuê, hệ thống tự chuyển máy sang Đang mượn.',
            'Khi trả máy, hệ thống phục hồi trạng thái trước khi mượn, thường là Hoạt động.',
            'Khi tạo phiếu bảo trì, hệ thống chuyển máy sang Bảo trì. Khi hoàn tất bảo trì, máy về Hoạt động.',
            'Khi có lệnh điều chuyển đang chờ hoặc đã duyệt, màn hình máy sẽ khóa thao tác tạo lệnh điều chuyển mới cho máy đó.',
        ],
        notes: [
            'Không nên đổi tay trạng thái Đang mượn nếu máy đang có giao dịch mượn/trả chưa hoàn tất.',
            'Nếu máy đang hỏng nhưng vẫn cần điều chuyển về kho sửa chữa, tạo điều chuyển sau khi kiểm tra không có lệnh mở khác.',
            'Trạng thái vị trí chỉ đổi khi hoàn tất điều chuyển, không đổi ngay lúc tạo lệnh.',
        ],
        related: ['machine-transfer-flow', 'machine-borrowing-flow', 'machine-maintenance-flow'],
    },
    {
        id: 'machine-transfer-flow',
        title: 'Điều chuyển máy giữa cơ sở hoặc khu vực',
        category: 'machine',
        routes: ['/assets', '/assets/*', '/transfers', '/transfers/*'],
        keywords: ['dieu chuyen may', 'chuyen may', 'ban giao may', 'lenh dieu chuyen', 'xuat kho may'],
        summary:
            'Điều chuyển dùng để ghi nhận việc di chuyển máy từ cơ sở/khu vực hiện tại sang điểm đến mới. Vị trí máy chỉ cập nhật khi lệnh được hoàn tất.',
        steps: [
            'Từ danh sách máy, chọn một máy hoặc chọn nhiều máy cùng cơ sở và cùng khu vực hiện tại.',
            'Bấm Điều chuyển, chọn cơ sở đến, khu vực đến, ngày điều chuyển, lý do và ghi chú bàn giao nếu có.',
            'Sau khi tạo, lệnh ở trạng thái Chờ duyệt. Máy sẽ hiện cờ đang có lệnh điều chuyển và không tạo thêm lệnh mới được.',
            'Quản lý hoặc admin vào Chuyển máy để duyệt lệnh. Sau khi duyệt, lệnh chuyển sang Đã duyệt và có thể xuất phiếu xuất kho.',
            'Khi máy đã bàn giao xong, bấm Hoàn tất, nhập người nhận và ảnh bàn giao nếu có.',
            'Khi hoàn tất, hệ thống cập nhật plantId và area của toàn bộ máy trong lệnh sang điểm đến mới.',
            'Nếu lệnh sai trước khi duyệt, có thể hủy. Nếu không đồng ý nghiệp vụ, quản lý có thể từ chối để lưu lý do.',
        ],
        notes: [
            'Một lệnh nhiều máy chỉ hợp lệ khi các máy cùng vị trí nguồn. Nếu khác cơ sở hoặc khác khu vực, hãy tách thành nhiều lệnh.',
            'Không tạo điều chuyển nếu điểm đến giống hệt vị trí hiện tại.',
            'Nếu không bấm Hoàn tất, danh sách máy vẫn giữ vị trí cũ dù lệnh đã được duyệt.',
        ],
        related: ['machine-create-and-import', 'machine-status-rules'],
    },
    {
        id: 'machine-borrowing-flow',
        title: 'Mượn nội bộ, mượn ngoài và thuê máy',
        category: 'machine',
        routes: ['/borrowings', '/borrowings/*', '/assets/*'],
        keywords: ['muon may', 'tra may', 'thue may', 'giao dich may', 'borrow', 'rental'],
        summary:
            'Giao dịch thiết bị dùng để theo dõi máy được cấp cho người dùng nội bộ, mượn từ đối tác hoặc thuê có chi phí.',
        steps: [
            'Vào Mượn / Trả hoặc mở chi tiết máy rồi bấm Tạo giao dịch.',
            'Chọn thiết bị và loại giao dịch: mượn nội bộ, mượn ngoài hoặc thuê máy.',
            'Với mượn nội bộ, nhập tên người mượn và mục đích sử dụng.',
            'Với mượn ngoài hoặc thuê, nhập đối tác/công ty. Với thuê máy, nhập thêm chi phí.',
            'Ghi vị trí sử dụng, thời gian bắt đầu và ghi chú bàn giao để sau này đối chiếu.',
            'Khi tạo giao dịch, trạng thái máy chuyển sang Đang mượn.',
            'Khi nhận lại máy, mở giao dịch và xác nhận trả. Hệ thống ghi thời gian trả, ghi chú trả và phục hồi trạng thái máy.',
        ],
        notes: [
            'Một máy chỉ nên có một giao dịch active tại một thời điểm.',
            'Không tạo giao dịch mới cho máy đang trong quá trình điều chuyển đã duyệt.',
            'Tên người mượn nội bộ hiện đang nhập tay, nên thống nhất cách ghi để dễ tìm kiếm.',
        ],
        related: ['machine-status-rules', 'machine-transfer-flow'],
    },
    {
        id: 'machine-maintenance-flow',
        title: 'Theo dõi bảo trì máy',
        category: 'machine',
        routes: ['/maintenances', '/assets/*'],
        keywords: ['bao tri may', 'phieu bao tri', 'sua may', 'lich su bao tri', 'hoan tat bao tri'],
        summary:
            'Bảo trì dùng để lưu lịch sử sửa chữa, kiểm tra, chi phí và ngày hoàn tất. Chi tiết máy hiện đã hiển thị lịch sử bảo trì.',
        steps: [
            'Mở chi tiết máy để xem tab Bảo trì và lịch sử liên quan.',
            'Khi tạo phiếu bảo trì, nhập loại bảo trì, mô tả lỗi hoặc hạng mục, ngày bắt đầu, kỹ thuật viên, chi phí dự kiến nếu có.',
            'Máy sẽ chuyển sang trạng thái Bảo trì trong thời gian xử lý.',
            'Khi sửa xong, hoàn tất phiếu bảo trì bằng ngày kết thúc, ghi chú nghiệm thu và chi phí thực tế.',
            'Sau khi hoàn tất, hệ thống cập nhật lastMaintenanceDate và chuyển máy về Hoạt động.',
            'Nếu máy chưa sửa xong, không nên đổi tay về Hoạt động vì sẽ làm lệch báo cáo trạng thái.',
        ],
        notes: [
            'Trang Bảo trì trên sidebar hiện đang là màn chờ, nên thao tác thực tế nên xuất phát từ chi tiết máy hoặc API đã có.',
            'Nếu tạo phiếu có ngày kết thúc ngay từ đầu, cần kiểm tra lại quy trình vì máy có thể vẫn bị set trạng thái Bảo trì.',
        ],
        related: ['machine-status-rules'],
    },
    {
        id: 'machine-qr-public',
        title: 'Tạo QR công khai cho máy',
        category: 'machine',
        routes: ['/assets', '/assets/*'],
        keywords: ['qr may', 'ma qr', 'public id', 'quet ma', 'tem may'],
        summary:
            'QR giúp người dùng ngoài hiện trường quét nhanh để xem thông tin cơ bản của máy mà không cần đăng nhập.',
        steps: [
            'Vào danh sách máy.',
            'Bấm nút QR ở dòng máy cần in tem. Nếu máy chưa có publicId, hệ thống sẽ tự tạo.',
            'Tải hoặc in QR và dán lên máy đúng với mã máy nội bộ.',
            'Khi quét QR, hệ thống mở trang public/machines/publicId để xem tên máy, mã máy, serial nếu có, model nếu có, trạng thái và cơ sở.',
            'Khi kiểm kê, ưu tiên đối chiếu mã máy trên tem QR với machineCode trong hệ thống.',
        ],
        notes: [
            'QR không thay thế machineCode. QR chỉ là cách truy cập nhanh hồ sơ máy.',
            'Không dán nhầm QR giữa hai máy vì sẽ làm sai lịch sử kiểm kê và điều chuyển.',
        ],
        related: ['machine-create-and-import'],
    },
    {
        id: 'material-catalog',
        title: 'Quản lý danh mục vật tư',
        category: 'material',
        routes: ['/materials'],
        keywords: ['danh muc vat tu', 'them vat tu', 'ma vat tu', 'import vat tu', 'don vi tinh', 'ton toi thieu'],
        summary:
            'Danh mục vật tư là dữ liệu gốc cho tồn kho, đề xuất mua, đề xuất cấp phát, đặt hàng và báo cáo.',
        steps: [
            'Vào Danh mục vật tư để thêm, sửa, tìm kiếm hoặc import vật tư từ Excel.',
            'Mỗi vật tư cần có mã vật tư, tên vật tư và đơn vị tính. Nhóm vật tư và tồn tối thiểu nên nhập để lọc và cảnh báo thiếu hàng.',
            'Mã vật tư nên được chuẩn hóa trước khi import tồn kho hoặc tạo đề xuất, vì các luồng sau dùng mã/danh mục này để liên kết.',
            'Khi import Excel, tải mẫu từ hệ thống, điền mã, tên, nhóm, đơn vị tính, tồn tối thiểu rồi preview trước khi xác nhận.',
            'Nếu vật tư đã tồn tại, hệ thống có thể cập nhật thay vì tạo mới tùy kết quả preview.',
            'Chỉ xóa hoặc ngừng hoạt động vật tư khi chắc không còn dùng trong tồn kho, đơn hàng hoặc báo cáo cần đối chiếu.',
        ],
        notes: [
            'Không tạo nhiều mã cho cùng một vật tư chỉ vì khác nhà cung cấp. Nhà cung cấp nên quản lý ở luồng NCC hoặc đơn mua.',
            'Đơn vị tính phải thống nhất, ví dụ cuộn, mét, cái, kg. Nếu đổi đơn vị sau khi đã phát sinh tồn kho, số liệu báo cáo dễ lệch.',
        ],
        related: ['material-inventory', 'material-purchase-request', 'material-report-overview'],
    },
    {
        id: 'material-suppliers',
        title: 'Quản lý nhà cung cấp vật tư',
        category: 'material',
        routes: ['/materials/suppliers'],
        keywords: ['nha cung cap', 'ncc', 'supplier', 'doi tac vat tu', 'lien he ncc'],
        summary:
            'Nhà cung cấp dùng để theo dõi đối tác mua vật tư, gắn với đề xuất mua, đơn đặt hàng và báo cáo chi phí theo NCC.',
        steps: [
            'Vào Nhà cung cấp để tạo hoặc cập nhật thông tin NCC.',
            'Nhập tên NCC, mã NCC nếu có, người liên hệ, số điện thoại, email, địa chỉ và ghi chú điều kiện hợp tác.',
            'Khi tạo đề xuất mua hoặc đơn đặt hàng, chọn NCC để sau này báo cáo chi phí theo nhà cung cấp chính xác.',
            'Nếu NCC không còn dùng, nên chuyển trạng thái không hoạt động thay vì xóa cứng để giữ lịch sử đơn hàng.',
            'Mở chi tiết NCC để xem các đơn hoặc tổng hợp liên quan nếu màn hình đang hỗ trợ.',
        ],
        notes: [
            'Nếu mua gấp từ NCC chưa có trong danh mục, nên tạo nhanh NCC rồi bổ sung thông tin sau, tránh để trống supplierName quá nhiều.',
            'Tên NCC cần thống nhất để báo cáo không bị tách thành nhiều dòng gần giống nhau.',
        ],
        related: ['material-purchase-request', 'material-purchase-order', 'material-report-supplier'],
    },
    {
        id: 'material-inventory',
        title: 'Theo dõi và đồng bộ tồn kho vật tư',
        category: 'material',
        routes: ['/materials/inventory'],
        keywords: ['ton kho', 'nhap ton', 'kiem ke vat tu', 'dieu chinh ton', 'lich su nhap xuat', 'stock'],
        summary:
            'Tồn kho cho biết số lượng vật tư theo từng cơ sở. Đây là dữ liệu vận hành quan trọng nhất của module vật tư.',
        steps: [
            'Vào Tồn kho để xem số lượng theo vật tư và cơ sở.',
            'Dùng bộ lọc cơ sở, nhóm vật tư hoặc ô tìm kiếm để kiểm tra nhanh một mã vật tư.',
            'Khi triển khai ban đầu, dùng Khởi tạo tồn hoặc Import Excel tồn kho để đưa số kiểm kê thực tế vào hệ thống.',
            'Khi import tồn kho, chọn đúng cơ sở trước, tải mẫu, điền mã vật tư và số tồn thực tế, sau đó preview lỗi.',
            'Nếu cần chỉnh một mã sau kiểm kê, dùng điều chỉnh tồn và nhập lý do rõ ràng.',
            'Theo dõi cảnh báo tồn thấp bằng minStockLevel để biết vật tư nào cần đề xuất mua hoặc cấp bổ sung.',
            'Xuất báo cáo tồn kho hoặc lịch sử nhập xuất khi cần đối chiếu với kho hoặc kế toán.',
        ],
        notes: [
            'Nhận hàng từ đơn đặt hàng sẽ làm tăng tồn kho.',
            'Cấp phát hoặc xuất kho sẽ làm giảm tồn kho theo cơ sở gửi.',
            'Không điều chỉnh tồn không có lý do, vì lịch sử nhập xuất là căn cứ đối chiếu.',
        ],
        related: ['material-catalog', 'material-distribution', 'material-purchase-order'],
    },
    {
        id: 'material-supply-request',
        title: 'Đề xuất cấp vật tư từ cơ sở',
        category: 'material',
        routes: ['/materials/supply-requests'],
        keywords: ['de xuat cap vat tu', 'yeu cau cap vat tu', 'xin cap vat tu', 'supply request'],
        summary:
            'Đề xuất cấp vật tư dùng khi cơ sở hoặc bộ phận cần xin vật tư từ kho/cơ sở chính thay vì mua mới.',
        steps: [
            'Vào Đề xuất cấp vật tư.',
            'Tạo phiếu mới, chọn cơ sở yêu cầu, vật tư, số lượng cần cấp và mục đích sử dụng.',
            'Kiểm tra kỹ số lượng yêu cầu, đơn vị tính và ghi chú trước khi gửi.',
            'Người có quyền duyệt xem danh sách phiếu, kiểm tra tồn kho và quyết định duyệt hoặc từ chối.',
            'Khi duyệt, nhập số lượng được duyệt cho từng dòng nếu khác số lượng yêu cầu.',
            'Sau duyệt, hệ thống có thể chuyển sang luồng cấp phát để tạo phiếu xuất/cấp vật tư.',
            'Khi phiếu liên quan được xác nhận cấp phát, trạng thái đề xuất sẽ phản ánh tiến độ xử lý.',
        ],
        notes: [
            'Đề xuất cấp khác đề xuất mua: cấp là xin từ tồn kho hiện có, mua là yêu cầu mua thêm từ NCC.',
            'Nếu tồn kho cơ sở gửi không đủ, nên chuyển sang đề xuất mua hoặc điều phối từ cơ sở khác.',
        ],
        related: ['material-distribution', 'material-inventory', 'material-purchase-request'],
    },
    {
        id: 'material-distribution',
        title: 'Cấp phát vật tư liên cơ sở và nội bộ',
        category: 'material',
        routes: ['/materials/distributions'],
        keywords: ['cap phat', 'xuat kho', 'nhan hang', 'distribution', 'noi bo', 'lien co so'],
        summary:
            'Cấp phát kiểm soát việc xuất vật tư từ kho/cơ sở gửi đến cơ sở nhận hoặc cấp nội bộ cho bộ phận/chuyền.',
        steps: [
            'Vào Cấp phát để xem danh sách phiếu, lọc theo trạng thái, loại phiếu, cơ sở nhận hoặc khoảng ngày.',
            'Với cấp liên cơ sở, tạo phiếu từ đề xuất cấp đã được duyệt hoặc chọn cơ sở nhận và danh sách vật tư cần xuất.',
            'Kiểm tra số lượng, đơn giá, VAT nếu có và ghi chú giao nhận trước khi xuất.',
            'Khi kho gửi xác nhận xuất, trạng thái chuyển sang đang xử lý/đã cấp phát và tồn kho cơ sở gửi bị trừ theo nghiệp vụ.',
            'Khi cơ sở nhận xác nhận đã nhận, phiếu chuyển sang Đã xác nhận.',
            'Với cấp phát nội bộ, chọn người yêu cầu, bộ phận/chuyền, vật tư và số lượng. Có thể lưu nháp rồi chốt phiếu.',
            'Khi chốt phiếu cấp nội bộ, tồn kho bị trừ ngay và thao tác không nên hoàn tác thủ công nếu chưa có phiếu điều chỉnh.',
            'Có thể xuất Excel từng phiếu hoặc xuất theo khoảng ngày để gửi kho/kế toán.',
        ],
        notes: [
            'Luôn kiểm tra cơ sở gửi và cơ sở nhận trước khi chốt vì tồn kho sẽ thay đổi theo cơ sở.',
            'Nếu số lượng thực cấp khác số lượng yêu cầu, ghi rõ lý do điều chỉnh ở dòng vật tư.',
            'Không xác nhận đã nhận nếu hàng chưa về thực tế, vì báo cáo sẽ coi phiếu đã hoàn tất.',
        ],
        related: ['material-supply-request', 'material-inventory', 'material-report-distribution'],
    },
    {
        id: 'material-purchase-request',
        title: 'Đề xuất mua vật tư',
        category: 'material',
        routes: ['/materials/purchase-requests'],
        keywords: ['de xuat mua', 'yeu cau mua', 'mua vat tu', 'purchase request', 'duyet mua'],
        summary:
            'Đề xuất mua dùng khi cần mua bổ sung từ nhà cung cấp. Luồng này thường dành cho cơ sở chính hoặc người có quyền mua sắm.',
        steps: [
            'Vào Đề xuất mua.',
            'Tạo phiếu mới, chọn cơ sở/tháng hoặc ngày yêu cầu, thêm từng dòng vật tư cần mua.',
            'Mỗi dòng nên có vật tư, số lượng yêu cầu, người đề xuất, mục đích, giá dự kiến, NCC dự kiến nếu biết và ghi chú.',
            'Lưu phiếu hoặc gửi chờ duyệt tùy thao tác màn hình.',
            'Người quản lý duyệt phiếu, có thể chỉnh số lượng duyệt, giá dự kiến, NCC hoặc ghi chú từng dòng.',
            'Nếu không hợp lệ, từ chối phiếu và nhập lý do để người tạo biết cần sửa gì.',
            'Các phiếu đã duyệt có thể được tổng hợp sang đơn đặt hàng.',
            'Xuất Excel phiếu khi cần gửi nội bộ hoặc lưu hồ sơ mua sắm.',
        ],
        notes: [
            'Đề xuất mua không tự tăng tồn kho. Tồn kho chỉ tăng khi đơn đặt hàng được nhận hàng.',
            'Nếu vật tư cần cấp ngay từ tồn hiện có, dùng Đề xuất cấp vật tư thay vì Đề xuất mua.',
            'Nếu quyền menu không hiện, kiểm tra vai trò và cơ sở chính trong cấu hình.',
        ],
        related: ['material-purchase-order', 'material-suppliers', 'material-report-price'],
    },
    {
        id: 'material-purchase-order',
        title: 'Đặt hàng và nhận hàng vật tư',
        category: 'material',
        routes: ['/materials/purchase-orders'],
        keywords: ['don dat hang', 'po', 'purchase order', 'nhan hang', 'confirm po', 'dat hang vat tu'],
        summary:
            'Đơn đặt hàng gom một hoặc nhiều đề xuất mua đã duyệt, cập nhật giá thực tế và ghi nhận nhận hàng vào tồn kho.',
        steps: [
            'Vào Đặt hàng.',
            'Tạo đơn từ các đề xuất mua đã được duyệt. Chọn đúng các phiếu cần gom và thêm ghi chú nếu cần.',
            'Mở chi tiết đơn để kiểm tra từng dòng vật tư, số lượng đặt, đơn giá, VAT và NCC.',
            'Cập nhật NCC, số lượng đặt hoặc giá trước khi xác nhận nếu dữ liệu từ đề xuất chưa đủ.',
            'Bấm xác nhận/đặt hàng để chuyển đơn sang trạng thái đang đặt hoặc đã xác nhận.',
            'Khi hàng về, bấm Nhận hàng. Hệ thống cập nhật receivedAt và tăng tồn kho theo vật tư/cơ sở nhận.',
            'Xuất Excel đơn hàng để gửi NCC hoặc lưu hồ sơ kế toán.',
        ],
        notes: [
            'Không bấm nhận hàng nếu hàng chưa nhập kho thực tế.',
            'Giá thực tế trong đơn hàng là nguồn chính cho báo cáo chi phí mua và so sánh chênh lệch giá.',
            'Nếu nhận thiếu/hoàn trả phát sinh, cần dùng luồng trả hàng hoặc điều chỉnh theo chức năng đang có của hệ thống.',
        ],
        related: ['material-purchase-request', 'material-inventory', 'material-report-price'],
    },
    {
        id: 'material-report-overview',
        title: 'Đọc báo cáo vật tư tổng quan',
        category: 'report',
        routes: ['/materials/reports'],
        keywords: ['bao cao vat tu', 'tong quan bao cao', 'chi phi vat tu', 'bao cao ton kho', 'report'],
        summary:
            'Báo cáo vật tư tổng hợp chi phí mua, chi phí cấp phát, tồn thấp, đề xuất đang chờ và các vật tư tiêu thụ nhiều.',
        steps: [
            'Vào Báo cáo vật tư.',
            'Chọn khoảng thời gian cần xem. Nếu cần phân tích theo cơ sở, chọn cơ sở cụ thể.',
            'Dùng bộ lọc vật tư, nhóm vật tư hoặc nhà cung cấp khi cần khoanh vùng số liệu.',
            'Xem các chỉ số tổng quan: tổng vật tư, chi phí mua, chi phí cấp phát, tồn thấp, phiếu chờ xử lý hoặc chi phí tháng.',
            'Kiểm tra biểu đồ chi phí theo thời gian để nhận biết tháng/quý phát sinh cao bất thường.',
            'Xem top vật tư tiêu thụ để biết vật tư nào cần kiểm soát định mức hoặc bổ sung tồn.',
            'Xuất Excel báo cáo sau khi đã chọn đúng bộ lọc, vì file xuất sẽ theo điều kiện đang chọn.',
        ],
        notes: [
            'Báo cáo phụ thuộc dữ liệu đơn hàng đã nhận và phiếu cấp phát đã xử lý/xác nhận.',
            'Nếu số liệu thiếu, kiểm tra trước xem đơn đã nhận hàng chưa hoặc phiếu cấp phát đã chốt/xác nhận chưa.',
        ],
        related: ['material-report-supplier', 'material-report-price', 'material-report-distribution'],
    },
    {
        id: 'material-report-supplier',
        title: 'Báo cáo chi phí theo nhà cung cấp',
        category: 'report',
        routes: ['/materials/reports', '/materials/suppliers'],
        keywords: ['bao cao ncc', 'chi phi nha cung cap', 'supplier report', 'nha cung cap nao mua nhieu'],
        summary:
            'Dùng để xem NCC nào có nhiều đơn, tổng giá trị mua cao và phục vụ đối chiếu công nợ/mua sắm.',
        steps: [
            'Vào Báo cáo vật tư và chọn khoảng ngày cần phân tích.',
            'Nếu chỉ xem một NCC, chọn nhà cung cấp trong bộ lọc.',
            'Xem bảng chi phí theo nhà cung cấp để biết số đơn và tổng tiền.',
            'Đối chiếu với danh sách Đặt hàng nếu thấy tổng tiền bất thường.',
            'Nếu một NCC bị tách thành nhiều dòng gần giống nhau, quay lại danh mục Nhà cung cấp để chuẩn hóa tên hoặc chọn đúng supplierId trong đơn hàng.',
        ],
        notes: [
            'Báo cáo theo NCC chính xác nhất khi đơn hàng có supplierId, không chỉ nhập tên tự do.',
            'Các đơn chưa nhận hàng có thể không phản ánh vào một số chỉ số chi phí thực tế tùy cách backend tính.',
        ],
        related: ['material-suppliers', 'material-purchase-order'],
    },
    {
        id: 'material-report-price',
        title: 'So sánh giá dự kiến và giá thực tế',
        category: 'report',
        routes: ['/materials/reports', '/materials/purchase-requests', '/materials/purchase-orders'],
        keywords: ['chenh lech gia', 'gia du kien', 'gia thuc te', 'price comparison', 'hoan tien'],
        summary:
            'Báo cáo so sánh giá giúp kiểm tra chênh lệch giữa đề xuất mua ban đầu và chi phí thực tế khi đặt/nhận hàng.',
        steps: [
            'Vào Báo cáo vật tư.',
            'Chọn khoảng thời gian và NCC nếu cần kiểm tra một đối tác cụ thể.',
            'Xem bảng so sánh giá: mã đơn, NCC, mã đề xuất, tổng dự kiến, tổng thực tế, hoàn tiền nếu có và chênh lệch.',
            'Nếu chênh lệch lớn, mở lại Đề xuất mua và Đặt hàng liên quan để kiểm tra số lượng, đơn giá, VAT và ghi chú.',
            'Dùng dữ liệu này để đánh giá chất lượng ước tính giá hoặc thương lượng lại với NCC.',
        ],
        notes: [
            'Giá dự kiến đến từ đề xuất mua; giá thực tế đến từ đơn đặt hàng.',
            'Nếu đề xuất không nhập giá dự kiến, cột chênh lệch có thể không có nhiều ý nghĩa.',
        ],
        related: ['material-purchase-request', 'material-purchase-order', 'material-report-supplier'],
    },
    {
        id: 'material-report-distribution',
        title: 'Báo cáo chi phí cấp phát vật tư',
        category: 'report',
        routes: ['/materials/reports', '/materials/distributions'],
        keywords: ['bao cao cap phat', 'chi phi cap phat', 'xuat kho theo co so', 'distribution cost'],
        summary:
            'Báo cáo cấp phát cho biết chi phí và số phiếu xuất theo cơ sở hoặc theo thời gian.',
        steps: [
            'Vào Báo cáo vật tư.',
            'Chọn khoảng ngày, cơ sở hoặc nhóm vật tư cần xem.',
            'Xem phần chi phí cấp phát theo cơ sở để biết nơi nào tiêu thụ vật tư nhiều.',
            'Xem phần chi phí theo kỳ để nhận biết thời điểm phát sinh tăng đột biến.',
            'Mở Cấp phát để đối chiếu các phiếu có giá trị lớn hoặc trạng thái chưa xác nhận.',
            'Xuất Excel nếu cần gửi kho, quản lý sản xuất hoặc kế toán.',
        ],
        notes: [
            'Phiếu cấp phát chưa chốt hoặc chưa xác nhận có thể làm số liệu chưa phản ánh đầy đủ.',
            'Nếu muốn so sánh định mức theo chuyền/bộ phận, cần nhập đầy đủ targetDepartment hoặc targetLine ở phiếu cấp nội bộ.',
        ],
        related: ['material-distribution', 'material-report-overview'],
    },
    {
        id: 'permissions-and-menus',
        title: 'Phân quyền và menu không hiển thị',
        category: 'admin',
        routes: ['/users', '/plants', '/materials/*', '/assets/*'],
        keywords: ['phan quyen', 'khong thay menu', 'admin', 'manager', 'staff', 'cs1', 'co so chinh'],
        summary:
            'Một số chức năng chỉ hiển thị với admin/manager hoặc quản lý cơ sở chính để tránh người dùng thao tác sai nghiệp vụ.',
        steps: [
            'Kiểm tra vai trò tài khoản ở Người dùng: admin, manager hoặc staff.',
            'Các thao tác tạo/sửa/xóa máy, import/export máy thường cần admin hoặc manager.',
            'Đề xuất mua và Đặt hàng vật tư có thể chỉ hiện với quản lý cơ sở chính theo cấu hình VITE_MAIN_PLANT_ID.',
            'Người dùng không thấy menu nên kiểm tra user.plantId có đúng cơ sở chính hay không.',
            'Nếu cần cấp quyền, admin cập nhật vai trò hoặc cơ sở của tài khoản rồi yêu cầu người dùng đăng xuất đăng nhập lại.',
        ],
        notes: [
            'Không nên cấp admin rộng nếu người dùng chỉ cần duyệt hoặc xem báo cáo.',
            'Khi triển khai thật, nên định nghĩa rõ ai được tạo phiếu, ai được duyệt, ai được xác nhận nhập/xuất kho.',
        ],
        related: ['material-purchase-request', 'material-purchase-order', 'machine-transfer-flow'],
    },
];

export const getRouteHelpTopics = (pathname: string, limit = 5) => {
    const routeTopics = HELP_TOPICS.filter((topic) => topic.routes.some((route) => routeMatches(pathname, route)));

    if (routeTopics.length >= limit) {
        return routeTopics.slice(0, limit);
    }

    const fallback = HELP_TOPICS.filter((topic) => !routeTopics.some((item) => item.id === topic.id));
    return [...routeTopics, ...fallback].slice(0, limit);
};

export const getTopicById = (id: string) => HELP_TOPICS.find((topic) => topic.id === id);

export const searchHelpTopics = (query: string, pathname: string, limit = 4) => {
    const normalizedQuery = normalizeText(query.trim());

    if (!normalizedQuery) {
        return getRouteHelpTopics(pathname, limit);
    }

    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    return HELP_TOPICS.map((topic) => {
        const haystack = normalizeText(
            [topic.title, topic.summary, topic.category, ...topic.keywords, ...topic.steps, ...(topic.notes ?? [])].join(' ')
        );
        const exactKeywordScore = topic.keywords.some((keyword) => normalizeText(keyword).includes(normalizedQuery)) ? 12 : 0;
        const routeScore = topic.routes.some((route) => routeMatches(pathname, route)) ? 4 : 0;
        const titleScore = normalizeText(topic.title).includes(normalizedQuery) ? 8 : 0;
        const tokenScore = queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);

        return {
            topic,
            score: exactKeywordScore + routeScore + titleScore + tokenScore,
        };
    })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => item.topic);
};


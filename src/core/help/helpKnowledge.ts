export type HelpCategory = 'machine' | 'material' | 'report' | 'admin' | 'general';

export type HelpTopic = {
    id: string;
    title: string;
    category: HelpCategory;
    routes: string[];
    keywords: string[];
    summary: string;
    prerequisites?: string[];
    steps: string[];
    checkpoints?: string[];
    commonMistakes?: string[];
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

const ADVANCED_HELP_TOPICS: HelpTopic[] = [
    {
        id: 'dashboard-operations-overview',
        title: 'Đọc nhanh màn hình tổng quan vận hành',
        category: 'general',
        routes: ['/dashboard'],
        keywords: ['dashboard', 'tong quan', 'canh bao', 'hoat dong gan day', 'thong ke'],
        summary:
            'Dashboard dùng để nhìn nhanh tình hình máy, vật tư, cấp phát và các việc cần xử lý. Đây là màn hình kiểm tra đầu ca hoặc trước khi báo cáo quản lý.',
        prerequisites: [
            'Tài khoản đã đăng nhập và được gán đúng cơ sở.',
            'Dữ liệu máy, tồn kho, cấp phát và phiếu mua đã được nhập vào hệ thống.',
        ],
        steps: [
            'Vào Tổng quan sau khi đăng nhập.',
            'Xem nhóm chỉ số máy để biết tổng máy, máy đang hoạt động, máy bảo trì, máy hỏng, máy đang mượn hoặc đang trong kho.',
            'Xem nhóm vật tư để biết vật tư sắp thiếu, tồn kho theo cơ sở và chi phí phát sinh gần đây.',
            'Kiểm tra khu vực hoạt động gần đây để biết ai vừa tạo phiếu, duyệt phiếu, xuất kho, nhận hàng hoặc cập nhật máy.',
            'Nếu thấy cảnh báo thiếu vật tư, mở sang Kho vật tư hoặc Báo cáo vật tư để kiểm tra chi tiết trước khi đề xuất mua hoặc cấp phát.',
            'Nếu thấy nhiều máy sai cơ sở hoặc chưa phân bổ, mở Quản lý máy để lọc theo cơ sở/khu vực và chuẩn hóa lại dữ liệu.',
        ],
        checkpoints: [
            'Số liệu trên dashboard phải khớp tương đối với các màn hình danh sách liên quan.',
            'Các cảnh báo tồn kho thấp nên được xử lý bằng đề xuất mua hoặc điều chuyển/cấp phát, không sửa tay nếu chưa kiểm kê.',
        ],
        commonMistakes: [
            'Chỉ nhìn dashboard rồi kết luận tồn kho mà không mở chi tiết giao dịch.',
            'Không lọc theo cơ sở nên nhầm số liệu toàn hệ thống với số liệu tại cơ sở của mình.',
        ],
        notes: [
            'Dashboard là màn hình theo dõi, không thay thế cho báo cáo Excel khi cần gửi chứng từ hoặc đối soát định kỳ.',
        ],
    },
    {
        id: 'machine-list-search-filter',
        title: 'Tìm kiếm, lọc và kiểm kê danh sách máy',
        category: 'machine',
        routes: ['/assets', '/assets/*'],
        keywords: ['tim may', 'loc may', 'kiem ke may', 'danh sach may', 'ma may', 'co so', 'khu vuc'],
        summary:
            'Danh sách máy là nơi tra cứu theo mã máy, tên máy, cơ sở, khu vực, nhãn hiệu và trạng thái để kiểm kê hoặc chuẩn bị điều chuyển.',
        prerequisites: [
            'Máy đã được tạo hoặc import vào hệ thống.',
            'Cơ sở và nhãn hiệu đã được khai báo nếu muốn lọc chính xác.',
        ],
        steps: [
            'Vào Quản lý máy > Máy.',
            'Gõ mã máy, tên máy hoặc thông tin liên quan vào ô tìm kiếm. Ưu tiên tìm bằng mã máy vì đây là định danh nội bộ duy nhất.',
            'Dùng bộ lọc cơ sở, khu vực, nhãn hiệu và trạng thái để thu hẹp danh sách.',
            'Khi kiểm kê thực tế, lọc theo từng cơ sở/khu vực rồi đối chiếu mã máy trên tem với mã máy trong hệ thống.',
            'Nếu phát hiện máy chưa có cơ sở rõ ràng, đưa về nhóm tạm như Chưa phân bổ hoặc Kho chờ phân loại rồi cập nhật sau.',
            'Nếu cần xuất danh sách, dùng nút xuất Excel theo bộ lọc hiện tại để tránh xuất thừa dữ liệu không liên quan.',
        ],
        checkpoints: [
            'Mỗi máy phải có mã máy riêng, không trùng.',
            'Cơ sở/khu vực trên hệ thống phải khớp với vị trí thực tế sau kiểm kê.',
            'Máy không có serial vẫn dùng được nếu mã máy nội bộ chính xác.',
        ],
        commonMistakes: [
            'Tìm bằng serial trong khi nhiều máy không có serial hoặc serial ghi không thống nhất.',
            'Import thêm máy mới thay vì cập nhật máy cũ khiến phát sinh trùng mã ngoài thực tế.',
        ],
        notes: [
            'Mã máy là khóa quản lý chính trong nghiệp vụ thực tế. Serial và model chỉ nên coi là thông tin bổ sung.',
        ],
        related: ['machine-create-and-import', 'machine-status-rules', 'machine-transfer-flow'],
    },
    {
        id: 'machine-detail-history',
        title: 'Xem hồ sơ chi tiết và lịch sử của một máy',
        category: 'machine',
        routes: ['/assets/*'],
        keywords: ['chi tiet may', 'lich su may', 'ho so may', 'bao tri may', 'lich su dieu chuyen'],
        summary:
            'Chi tiết máy dùng để xem toàn bộ hồ sơ vận hành: thông tin định danh, vị trí, trạng thái, bảo trì, điều chuyển, mượn trả và QR.',
        prerequisites: [
            'Biết mã máy hoặc mở từ danh sách máy.',
            'Có quyền xem máy; một số thao tác sửa cần manager hoặc admin.',
        ],
        steps: [
            'Vào Quản lý máy > Máy rồi bấm vào dòng máy cần xem.',
            'Kiểm tra phần thông tin chính: mã máy, tên máy, loại máy, nhãn hiệu, model, serial, cơ sở và khu vực.',
            'Xem trạng thái hiện tại để biết máy đang hoạt động, bảo trì, hỏng, đang mượn hoặc tồn kho.',
            'Mở phần lịch sử điều chuyển để biết máy đã đi qua cơ sở/khu vực nào và lệnh nào đang mở.',
            'Mở phần bảo trì để biết lần bảo trì gần nhất, trạng thái bảo trì và ghi chú sửa chữa.',
            'Mở phần mượn/trả để biết máy đang được ai giữ, thời gian mượn và tình trạng trả.',
            'Nếu cần dán tem hoặc tra cứu nhanh, mở QR của máy và dùng đường dẫn công khai để xem thông tin cơ bản.',
        ],
        checkpoints: [
            'Nếu có lệnh điều chuyển đang chờ hoặc đã duyệt, không tạo thêm lệnh mới cho máy đó.',
            'Nếu máy đang mượn, không tự đổi trạng thái thủ công trước khi xác nhận trả.',
        ],
        commonMistakes: [
            'Chỉ sửa trạng thái mà không tạo phiếu nghiệp vụ nên không có lịch sử đối soát.',
            'Đổi mã máy sau khi đã phát sinh QR hoặc phiếu điều chuyển làm lệch hồ sơ giấy.',
        ],
        notes: [
            'Chi tiết máy là nơi đối chiếu cuối cùng khi có tranh chấp về vị trí, người giữ hoặc tình trạng máy.',
        ],
    },
    {
        id: 'master-data-plants-brands',
        title: 'Quản lý cơ sở và nhãn hiệu dùng chung',
        category: 'admin',
        routes: ['/plants', '/brands'],
        keywords: ['co so', 'plant', 'nhan hieu', 'brand', 'du lieu dung chung', 'khu vuc'],
        summary:
            'Cơ sở và nhãn hiệu là dữ liệu nền cho máy, vật tư, điều chuyển và báo cáo. Khai báo sai dữ liệu nền sẽ làm lệch bộ lọc và báo cáo.',
        prerequisites: [
            'Chỉ admin nên tạo, sửa hoặc xóa cơ sở/nhãn hiệu.',
            'Cần thống nhất mã cơ sở, tên cơ sở và cách đặt tên nhãn hiệu trước khi nhập dữ liệu hàng loạt.',
        ],
        steps: [
            'Vào Danh mục > Cơ sở để tạo hoặc cập nhật cơ sở, mã cơ sở, địa chỉ và số liên hệ.',
            'Dùng mã cơ sở ngắn, ổn định và không đổi tùy tiện sau khi đã có máy hoặc vật tư phát sinh.',
            'Vào Danh mục > Nhãn hiệu để tạo nhãn hiệu máy móc dùng khi nhập máy.',
            'Trước khi xóa cơ sở hoặc nhãn hiệu, kiểm tra xem dữ liệu đó đang được máy, vật tư hoặc phiếu sử dụng hay không.',
            'Sau khi sửa dữ liệu nền, yêu cầu người dùng tải lại trang nếu danh sách lọc chưa cập nhật.',
        ],
        checkpoints: [
            'Cơ sở chính phải khớp với cấu hình VITE_MAIN_PLANT_ID nếu hệ thống dùng luồng kho trung tâm.',
            'Tên cơ sở trong phiếu cấp phát và báo cáo phải thống nhất với danh mục cơ sở.',
        ],
        commonMistakes: [
            'Tạo nhiều cơ sở trùng nghĩa như CS1, Cơ sở 1, Kho chính làm báo cáo bị tách dòng.',
            'Xóa mềm dữ liệu nền rồi tạo lại bản mới khiến lịch sử cũ và dữ liệu mới không còn cùng khóa.',
        ],
        notes: [
            'Dữ liệu nền nên được chuẩn hóa trước khi import máy và vật tư hàng loạt.',
        ],
    },
    {
        id: 'material-import-catalog',
        title: 'Import và chuẩn hóa danh mục vật tư',
        category: 'material',
        routes: ['/materials'],
        keywords: ['import vat tu', 'danh muc vat tu', 'ma vat tu', 'excel vat tu', 'ton toi thieu'],
        summary:
            'Danh mục vật tư quản lý mã vật tư, tên, nhóm, đơn vị tính và tồn tối thiểu. Đây là nền cho tồn kho, mua hàng, cấp phát và báo cáo.',
        prerequisites: [
            'Có file Excel theo mẫu hệ thống hoặc tải mẫu trực tiếp trong modal import.',
            'Mỗi vật tư phải có mã vật tư, tên vật tư và đơn vị tính.',
        ],
        steps: [
            'Vào Vật tư > Danh mục vật tư.',
            'Nếu thêm từng vật tư, bấm Thêm vật tư và nhập mã, tên, nhóm, đơn vị tính, tồn tối thiểu và trạng thái hoạt động.',
            'Nếu nhập hàng loạt, bấm Import Excel rồi tải file mẫu.',
            'Điền dữ liệu vào file mẫu. Mã vật tư đã tồn tại sẽ được cập nhật, mã mới sẽ được tạo mới.',
            'Tải file lên và bấm Xem trước để hệ thống kiểm tra từng dòng.',
            'Đọc bảng preview: dòng hợp lệ, dòng lỗi, tạo mới, cập nhật. Sửa file nếu lỗi nhiều hoặc lỗi ở vật tư quan trọng.',
            'Chỉ bấm Import khi số dòng hợp lệ đúng với dữ liệu muốn đưa vào hệ thống.',
        ],
        checkpoints: [
            'Mã vật tư không được dùng tùy tiện theo tên gọi miệng; cần thống nhất với kho hoặc kế toán.',
            'Đơn vị tính phải thống nhất vì tồn kho và cấp phát cộng trừ theo đơn vị này.',
            'Tồn tối thiểu nên được nhập để dashboard và báo cáo cảnh báo thiếu hàng.',
        ],
        commonMistakes: [
            'Đổi mã vật tư sau khi đã có giao dịch kho, làm lịch sử khó đối chiếu.',
            'Dùng nhiều tên khác nhau cho cùng một vật tư thay vì cập nhật một mã vật tư duy nhất.',
        ],
        notes: [
            'Không nên nhập tồn kho ngay trong danh mục vật tư. Tồn kho phải đi qua màn Kho vật tư để có lịch sử giao dịch.',
        ],
        related: ['material-inventory-initialize-import', 'material-report-overview'],
    },
    {
        id: 'material-inventory-initialize-import',
        title: 'Đồng bộ tồn kho ban đầu và import tồn kho',
        category: 'material',
        routes: ['/materials/inventory'],
        keywords: ['ton kho ban dau', 'dong bo ton kho', 'import ton kho', 'kiem ke kho', 'cs1'],
        summary:
            'Kho vật tư lưu tồn theo từng cơ sở. Khi triển khai thực tế, cần kiểm kê và đồng bộ tồn ban đầu trước khi chạy mua hàng/cấp phát.',
        prerequisites: [
            'Danh mục vật tư đã có mã vật tư đầy đủ.',
            'Cơ sở nhận tồn kho đã được khai báo.',
            'Người thao tác cần quyền phù hợp; hệ thống hiện cho chỉnh tồn chủ yếu với admin tại cơ sở chính.',
        ],
        steps: [
            'Vào Vật tư > Kho vật tư.',
            'Lọc đúng cơ sở cần nhập tồn, thường là kho chính hoặc cơ sở đang kiểm kê.',
            'Nếu nhập thủ công ít dòng, bấm Nhập tồn kho ban đầu, chọn vật tư, nhập số lượng thực tế và ghi lý do.',
            'Nếu nhập nhiều dòng, bấm Import tồn kho từ Excel, tải file mẫu rồi điền mã vật tư và tồn mới.',
            'Nhập lý do rõ ràng, ví dụ Kiểm kê đầu kỳ tháng 01/2026 hoặc Đồng bộ tồn kho CS1.',
            'Bấm Xem trước để kiểm tra mã vật tư tồn tại, tồn hiện tại, tồn mới và dòng lỗi.',
            'Bấm Import hoặc xác nhận khi các dòng hợp lệ đã đúng. Hệ thống sẽ tạo giao dịch điều chỉnh để có lịch sử.',
        ],
        checkpoints: [
            'Sau khi nhập, mở lại Kho vật tư và lọc theo cơ sở để kiểm tra tồn mới.',
            'Mở lịch sử giao dịch để chắc có dòng điều chỉnh kèm lý do.',
            'Nếu tồn thay đổi lớn, nên lưu lại file kiểm kê gốc để đối chiếu.',
        ],
        commonMistakes: [
            'Nhập nhầm cơ sở khiến tồn kho báo sai nơi có hàng.',
            'Dùng import tồn kho như thao tác nhập hàng mua về. Hàng mua về nên đi qua Đơn đặt hàng và Nhận hàng.',
            'Không nhập lý do rõ ràng khiến sau này không biết vì sao tồn bị điều chỉnh.',
        ],
        notes: [
            'Đồng bộ tồn ban đầu nên làm một lần theo kỳ triển khai. Sau đó ưu tiên dùng nhập hàng, xuất kho, cấp phát và điều chỉnh có lý do.',
        ],
        related: ['material-import-catalog', 'material-inventory-history-adjust'],
    },
    {
        id: 'material-inventory-history-adjust',
        title: 'Xem lịch sử kho và điều chỉnh tồn vật tư',
        category: 'material',
        routes: ['/materials/inventory'],
        keywords: ['lich su kho', 'giao dich kho', 'dieu chinh ton', 'nhap kho', 'xuat kho'],
        summary:
            'Lịch sử kho cho biết tồn tăng giảm do nhập, xuất, cấp phát hoặc điều chỉnh. Đây là nơi đối soát khi số lượng thực tế và hệ thống lệch nhau.',
        prerequisites: [
            'Đã có vật tư và tồn kho theo cơ sở.',
            'Biết khoảng thời gian hoặc mã vật tư cần kiểm tra.',
        ],
        steps: [
            'Vào Vật tư > Kho vật tư.',
            'Tìm vật tư hoặc lọc theo nhóm/cơ sở để mở đúng dòng tồn.',
            'Bấm xem lịch sử hoặc thao tác liên quan trên dòng vật tư để mở giao dịch kho.',
            'Lọc theo thời gian, loại giao dịch hoặc vật tư để tìm nguyên nhân tăng giảm tồn.',
            'Đọc loại giao dịch: import/nhập kho làm tăng tồn, export/xuất kho làm giảm tồn, adjust/adjustment là điều chỉnh thủ công.',
            'Nếu tồn sai do kiểm kê, dùng điều chỉnh tồn và nhập lý do cụ thể.',
            'Xuất lịch sử hoặc tồn kho ra Excel khi cần gửi đối soát cho quản lý/kế toán.',
        ],
        checkpoints: [
            'Tồn hiện tại phải bằng tồn đầu kỳ cộng nhập trừ xuất cộng/trừ điều chỉnh.',
            'Giao dịch liên quan đến cấp phát phải khớp với phiếu cấp phát ở màn Cấp phát vật tư.',
        ],
        commonMistakes: [
            'Điều chỉnh tồn để sửa lỗi phiếu cấp phát trong khi phiếu gốc vẫn sai.',
            'Không kiểm tra cơ sở nên tưởng thiếu hàng toàn hệ thống trong khi chỉ thiếu tại một cơ sở.',
        ],
        notes: [
            'Điều chỉnh tồn là thao tác nhạy cảm, nên có lý do và người chịu trách nhiệm rõ ràng.',
        ],
    },
    {
        id: 'supply-request-full-flow',
        title: 'Đề xuất cấp vật tư từ cơ sở',
        category: 'material',
        routes: ['/materials/supply-requests'],
        keywords: ['de xuat cap vat tu', 'yeu cau cap vat tu', 'co so gui', 'duyet cap phat', 'nhan hang'],
        summary:
            'Đề xuất cấp vật tư dùng khi một cơ sở cần kho chính cấp vật tư. Luồng điển hình là tạo phiếu, duyệt, cấp phát, xuất kho và cơ sở xác nhận nhận hàng.',
        prerequisites: [
            'Người tạo phiếu thuộc đúng cơ sở gửi.',
            'Biết tên vật tư, đơn vị tính, số lượng cần và lý do/mục đích sử dụng.',
            'Kho chính có người đủ quyền duyệt và xuất kho.',
        ],
        steps: [
            'Vào Vật tư > Đề xuất cấp vật tư.',
            'Bấm Tạo đề xuất, kiểm tra cơ sở gửi, chọn ngày đề xuất và nhập lý do tối thiểu rõ ràng.',
            'Thêm danh sách vật tư: tên vật tư, đơn vị tính, số lượng và ghi chú nếu cần.',
            'Bấm Gửi đề xuất. Phiếu chuyển sang trạng thái Chờ duyệt.',
            'Người quản lý kho chính mở tab chờ duyệt, kiểm tra số lượng và lý do.',
            'Nếu hợp lệ, duyệt phiếu. Nếu thiếu thông tin hoặc không đồng ý, từ chối để lưu lý do.',
            'Sau khi duyệt, tạo phiếu cấp phát từ đề xuất hoặc dùng thao tác duyệt và cấp phát nếu hệ thống hiển thị.',
            'Khi kho xuất hàng, trạng thái chuyển sang Đang cấp phát hoặc Đã xuất - chờ nhận.',
            'Khi cơ sở nhận đủ hàng, xác nhận nhận hàng để hoàn tất luồng.',
        ],
        checkpoints: [
            'Phiếu đã duyệt phải có thể truy ra phiếu cấp phát liên quan.',
            'Tồn kho cơ sở xuất phải giảm sau khi xuất kho.',
            'Trạng thái cuối cùng phải là đã nhận hàng/đã cấp phát tùy màn hình hiển thị.',
        ],
        commonMistakes: [
            'Tạo đề xuất cấp vật tư trong khi thực tế là nhu cầu mua mới. Trường hợp chưa có hàng ở kho chính nên dùng Đề xuất mua.',
            'Không ghi lý do đủ rõ khiến người duyệt phải hỏi lại.',
        ],
        notes: [
            'Đề xuất cấp vật tư là luồng nội bộ giữa cơ sở và kho chính, khác với đề xuất mua hàng từ nhà cung cấp.',
        ],
        related: ['distribution-facility-transfer-flow', 'purchase-request-full-flow'],
    },
    {
        id: 'distribution-facility-transfer-flow',
        title: 'Cấp phát vật tư liên cơ sở',
        category: 'material',
        routes: ['/materials/distributions'],
        keywords: ['cap phat vat tu', 'xuat kho', 'nhan hang', 'lien co so', 'distribution'],
        summary:
            'Cấp phát liên cơ sở ghi nhận việc kho chính xuất vật tư cho cơ sở khác. Tồn kho giảm khi xuất và phiếu hoàn tất khi bên nhận xác nhận.',
        prerequisites: [
            'Đã có đề xuất cấp vật tư được duyệt hoặc đủ thông tin để tạo phiếu cấp phát.',
            'Kho xuất có tồn đủ cho số lượng cấp phát.',
            'Người thao tác tại kho chính có quyền quản lý cấp phát.',
        ],
        steps: [
            'Vào Vật tư > Cấp phát vật tư.',
            'Bấm tạo cấp phát từ đề xuất đã duyệt hoặc mở phiếu được điều hướng từ màn Đề xuất cấp vật tư.',
            'Kiểm tra cơ sở nhận, danh sách vật tư, số lượng và đơn giá/VAT nếu có quản lý chi phí.',
            'Lưu phiếu. Phiếu ở trạng thái Chờ xuất kho hoặc Đang xử lý.',
            'Khi hàng thực tế rời kho, bấm Xuất kho. Hệ thống trừ tồn tại kho xuất.',
            'Có thể xuất Excel phiếu cấp phát để in hoặc gửi kèm hàng.',
            'Khi cơ sở nhận hàng kiểm đủ, bấm Xác nhận nhận hàng để hoàn tất phiếu.',
        ],
        checkpoints: [
            'Sau khi Xuất kho, tồn kho CS1/kho xuất phải giảm đúng số lượng.',
            'Sau khi Xác nhận nhận hàng, phiếu phải sang Hoàn thành.',
            'Báo cáo cấp phát phải ghi nhận chi phí và cơ sở nhận.',
        ],
        commonMistakes: [
            'Bấm xác nhận nhận hàng trước khi phiếu được xuất kho. Hệ thống sẽ chặn vì trạng thái chưa hợp lệ.',
            'Xuất kho khi hàng chưa rời kho thực tế làm tồn hệ thống giảm sớm.',
        ],
        notes: [
            'Nên coi nút Xuất kho như điểm chốt trách nhiệm của kho xuất. Sau bước này tồn đã thay đổi.',
        ],
        related: ['supply-request-full-flow', 'material-report-distribution'],
    },
    {
        id: 'distribution-internal-issue-flow',
        title: 'Cấp phát vật tư nội bộ trong một cơ sở',
        category: 'material',
        routes: ['/materials/distributions'],
        keywords: ['cap phat noi bo', 'xuat noi bo', 'to san xuat', 'bo phan nhan', 'phieu nhap'],
        summary:
            'Cấp phát nội bộ dùng khi vật tư được xuất cho bộ phận, chuyền, tổ hoặc người dùng trong cùng một cơ sở, không đi qua luồng nhận hàng liên cơ sở.',
        prerequisites: [
            'Cơ sở hiện tại có tồn kho vật tư.',
            'Biết người xin cấp, bộ phận/chuyền nhận và danh sách vật tư cần cấp.',
        ],
        steps: [
            'Vào Vật tư > Cấp phát vật tư.',
            'Bấm Cấp phát nội bộ.',
            'Nhập người xin cấp, bộ phận nhận, chuyền/line nếu có, ngày cấp và ghi chú chung.',
            'Thêm từng vật tư từ danh sách tồn kho. Hệ thống hiển thị tồn hiện tại để tránh xuất quá tồn.',
            'Nhập số lượng, đơn giá, VAT và ghi chú từng dòng nếu cần theo dõi chi phí.',
            'Nếu chưa muốn trừ kho ngay, lưu nháp. Có thể mở lại phiếu nháp trong ngày để thêm vật tư.',
            'Nếu đã chắc chắn cấp phát, bấm tạo và xác nhận ngay hoặc chốt phiếu nháp. Tồn kho bị trừ tại thời điểm chốt.',
        ],
        checkpoints: [
            'Không được xuất số lượng lớn hơn tồn hiện có.',
            'Phiếu nháp chưa trừ kho; phiếu đã chốt/confirmed mới làm giảm tồn.',
            'Báo cáo cấp phát nội bộ cần có người xin cấp hoặc bộ phận để truy trách nhiệm.',
        ],
        commonMistakes: [
            'Lưu nháp rồi tưởng tồn đã trừ.',
            'Không nhập bộ phận/chuyền nhận nên cuối tháng khó phân bổ chi phí.',
        ],
        notes: [
            'Với cấp phát dùng ngay trong nội bộ, luồng này nhanh hơn đề xuất cấp vật tư liên cơ sở.',
        ],
    },
    {
        id: 'express-dispatch-flow',
        title: 'Xuất thẳng vật tư khi mua về giao ngay',
        category: 'material',
        routes: ['/materials/distributions'],
        keywords: ['xuat thang', 'mua ve giao ngay', 'express dispatch', 'nha cung cap nhanh'],
        summary:
            'Xuất thẳng dùng cho trường hợp mua vật tư và giao ngay cho cơ sở nhận, không cần nhập tồn kho trung gian lâu dài.',
        prerequisites: [
            'Biết cơ sở nhận, danh sách vật tư, số lượng, đơn giá, VAT và nhà cung cấp.',
            'Nếu nhà cung cấp chưa có trong danh mục, cần nhập thông tin nhà cung cấp nhanh nếu form cho phép.',
        ],
        steps: [
            'Vào Vật tư > Cấp phát vật tư.',
            'Bấm Xuất thẳng.',
            'Chọn cơ sở nhận.',
            'Thêm từng dòng vật tư: tên vật tư, đơn vị tính, số lượng, đơn giá, VAT và nhà cung cấp.',
            'Nếu chưa có nhà cung cấp, dùng phần tạo nhanh nhà cung cấp và nhập tên, điện thoại/địa chỉ nếu có.',
            'Kiểm tra tổng tiền, VAT và tổng sau VAT.',
            'Bấm xác nhận để hệ thống tạo đồng thời chứng từ mua/đơn hàng và phiếu cấp phát liên quan.',
        ],
        checkpoints: [
            'Sau khi thành công, thông báo sẽ hiển thị mã đơn hàng và mã phiếu cấp phát.',
            'Kiểm tra lại ở Đơn đặt hàng và Cấp phát vật tư để chắc chứng từ đã sinh đúng.',
        ],
        commonMistakes: [
            'Dùng xuất thẳng cho hàng đã có sẵn trong kho. Trường hợp đó nên dùng cấp phát từ tồn kho.',
            'Không nhập đúng nhà cung cấp khiến báo cáo theo nhà cung cấp bị sai.',
        ],
        notes: [
            'Xuất thẳng phù hợp nghiệp vụ cần tốc độ, nhưng vẫn phải nhập đủ giá và nhà cung cấp để báo cáo chi phí không bị thiếu.',
        ],
    },
    {
        id: 'purchase-request-full-flow',
        title: 'Đề xuất mua vật tư',
        category: 'material',
        routes: ['/materials/purchase-requests'],
        keywords: ['de xuat mua', 'mua vat tu', 'duyet mua', 'vat', 'don gia', 'nha cung cap'],
        summary:
            'Đề xuất mua dùng khi cần mua vật tư từ nhà cung cấp. Phiếu có thể lưu nháp, gửi duyệt, duyệt rồi gom sang đơn đặt hàng.',
        prerequisites: [
            'Người tạo cần biết tháng/năm đề xuất, vật tư cần mua, số lượng, đơn vị tính, mục đích và người đề xuất.',
            'Nếu có báo giá, nên nhập đơn giá, VAT và nhà cung cấp để quản lý chi phí.',
            'Một số màn mua hàng có thể chỉ mở cho quản lý tại cơ sở chính theo cấu hình hệ thống.',
        ],
        steps: [
            'Vào Vật tư > Đề xuất mua.',
            'Bấm Tạo đề xuất.',
            'Chọn tháng/năm đề xuất.',
            'Thêm từng dòng vật tư: tên vật tư, cơ sở, người đề xuất, số lượng cần, đơn vị tính và mục đích.',
            'Nếu đã có thông tin mua, nhập số lượng đặt, đơn giá, VAT, ngày đặt, ngày nhận dự kiến và nhà cung cấp.',
            'Bấm Lưu nháp nếu chưa đủ thông tin hoặc Gửi duyệt nếu đã sẵn sàng.',
            'Người có quyền duyệt mở phiếu, kiểm tra chi tiết và bấm Duyệt hoặc Từ chối.',
            'Phiếu đã duyệt sẽ được dùng để tạo Đơn đặt hàng.',
        ],
        checkpoints: [
            'Phiếu gửi duyệt phải có ít nhất một dòng vật tư hợp lệ.',
            'Tổng tiền, VAT và tổng sau VAT phải khớp với các dòng đã nhập.',
            'Phiếu được duyệt mới nên chuyển sang đơn đặt hàng.',
        ],
        commonMistakes: [
            'Nhầm đề xuất mua với đề xuất cấp vật tư. Nếu kho chính có hàng sẵn thì nên dùng đề xuất cấp.',
            'Không nhập mục đích hoặc người đề xuất làm phiếu thiếu căn cứ duyệt.',
        ],
        notes: [
            'Đề xuất mua là bước nhu cầu và phê duyệt, chưa có nghĩa là hàng đã đặt hoặc đã nhập kho.',
        ],
        related: ['purchase-order-full-flow', 'supply-request-full-flow'],
    },
    {
        id: 'purchase-order-full-flow',
        title: 'Tạo đơn đặt hàng và nhận hàng vào kho',
        category: 'material',
        routes: ['/materials/purchase-orders'],
        keywords: ['don dat hang', 'po', 'nhan hang', 'nhap kho', 'tra hang nha cung cap'],
        summary:
            'Đơn đặt hàng được tạo từ các đề xuất mua đã duyệt. Khi xác nhận nhận hàng, hệ thống ghi nhận hàng về và cập nhật tồn kho.',
        prerequisites: [
            'Có ít nhất một đề xuất mua ở trạng thái Đã duyệt.',
            'Thông tin nhà cung cấp, số lượng đặt, đơn giá và VAT đã được kiểm tra.',
            'Người xác nhận nhận hàng cần chắc hàng thực tế đã về kho.',
        ],
        steps: [
            'Vào Vật tư > Đơn đặt hàng.',
            'Bấm Tạo đơn hàng và chọn các đề xuất mua đã duyệt.',
            'Kiểm tra danh sách vật tư, số lượng, nhà cung cấp và tổng tiền.',
            'Tạo đơn hàng. Đơn hàng chuyển sang trạng thái đã xác nhận hoặc đang đặt tùy luồng màn hình.',
            'Mở chi tiết đơn hàng để chỉnh các dòng nếu cần: nhà cung cấp, số lượng, đơn giá, VAT hoặc ghi chú.',
            'Khi hàng về thực tế, bấm Nhận hàng. Hệ thống cập nhật trạng thái đơn và ghi tăng tồn kho.',
            'Nếu có hàng trả lại nhà cung cấp sau khi đã nhận, mở chức năng trả hàng trong chi tiết đơn và nhập số lượng, lý do trả.',
            'Xuất Excel đơn hàng nếu cần in, gửi nhà cung cấp hoặc lưu chứng từ.',
        ],
        checkpoints: [
            'Chỉ nhận hàng khi đã kiểm thực tế số lượng và chất lượng.',
            'Sau khi nhận hàng, kiểm tra Kho vật tư để chắc tồn đã tăng.',
            'Nếu có trả hàng, báo cáo chi phí và đơn hàng phải thể hiện số tiền hoàn/giảm tương ứng nếu backend hỗ trợ.',
        ],
        commonMistakes: [
            'Bấm nhận hàng trước khi hàng về làm tồn kho tăng ảo.',
            'Tạo đơn hàng từ phiếu chưa duyệt khiến mất bước kiểm soát.',
            'Không cập nhật nhà cung cấp đúng làm báo cáo theo nhà cung cấp sai.',
        ],
        notes: [
            'Đơn đặt hàng là điểm nối giữa đề xuất mua, nhà cung cấp, tồn kho và báo cáo chi phí.',
        ],
        related: ['purchase-request-full-flow', 'material-report-supplier-price'],
    },
    {
        id: 'supplier-management-flow',
        title: 'Quản lý nhà cung cấp vật tư',
        category: 'material',
        routes: ['/materials/suppliers', '/materials/purchase-requests', '/materials/purchase-orders'],
        keywords: ['nha cung cap', 'supplier', 'bao gia', 'so dien thoai', 'dia chi', 'cong no'],
        summary:
            'Nhà cung cấp được dùng trong đề xuất mua, đơn đặt hàng, xuất thẳng và báo cáo chi phí theo nhà cung cấp.',
        prerequisites: [
            'Có thông tin tối thiểu: tên nhà cung cấp. Nên bổ sung điện thoại, địa chỉ, người liên hệ nếu có.',
            'Cần thống nhất tên nhà cung cấp để tránh trùng lặp.',
        ],
        steps: [
            'Vào Vật tư > Nhà cung cấp.',
            'Tạo nhà cung cấp mới hoặc tìm nhà cung cấp đã có trước khi thêm.',
            'Nhập tên, thông tin liên hệ, địa chỉ và ghi chú nếu cần.',
            'Khi lập đề xuất mua hoặc đơn đặt hàng, chọn đúng nhà cung cấp từ danh sách.',
            'Nếu đang xuất thẳng và nhà cung cấp chưa có, dùng tạo nhanh nhưng sau đó nên kiểm tra lại trong danh mục.',
            'Định kỳ lọc hoặc rà soát nhà cung cấp không còn dùng để chuyển trạng thái không hoạt động thay vì tạo trùng.',
        ],
        checkpoints: [
            'Tên nhà cung cấp trên đơn hàng phải khớp với báo giá/chứng từ thực tế.',
            'Báo cáo theo nhà cung cấp chỉ chính xác khi phiếu mua và đơn hàng chọn đúng nhà cung cấp.',
        ],
        commonMistakes: [
            'Tạo cùng một nhà cung cấp bằng nhiều cách viết khác nhau.',
            'Để trống nhà cung cấp trong phiếu có chi phí mua hàng.',
        ],
        notes: [
            'Nhà cung cấp là dữ liệu phục vụ báo cáo. Càng chuẩn hóa sớm thì báo cáo càng ít phải làm sạch thủ công.',
        ],
    },
    {
        id: 'material-report-deep-guide',
        title: 'Đọc và xuất báo cáo vật tư',
        category: 'report',
        routes: ['/materials/reports'],
        keywords: ['bao cao vat tu', 'bao cao chi phi', 'top vat tu', 'so sanh gia', 'bao cao nha cung cap', 'xuat excel'],
        summary:
            'Báo cáo vật tư tổng hợp chi phí mua, cấp phát, vật tư tiêu thụ nhiều, nhà cung cấp và so sánh giá theo khoảng thời gian.',
        prerequisites: [
            'Các phiếu mua, đơn hàng, nhận hàng, cấp phát và kho đã được ghi nhận đúng luồng.',
            'Chọn đúng khoảng ngày, cơ sở, vật tư, nhóm vật tư, nhà cung cấp và trạng thái trước khi đọc số liệu.',
        ],
        steps: [
            'Vào Vật tư > Báo cáo vật tư.',
            'Chọn khoảng thời gian nhanh như tháng này, quý, 6 tháng, năm hoặc chọn khoảng tùy chỉnh.',
            'Nếu cần báo cáo theo cơ sở, chọn cơ sở; nếu cần phân tích một vật tư, chọn vật tư hoặc nhóm vật tư.',
            'Xem phần tổng quan để nắm tổng chi phí, số phiếu, vật tư tiêu thụ và cảnh báo tồn thấp.',
            'Xem biểu đồ chi phí theo kỳ để biết xu hướng tăng giảm theo ngày/tháng/quý.',
            'Xem top vật tư tiêu thụ để biết vật tư nào dùng nhiều hoặc phát sinh chi phí cao.',
            'Xem báo cáo nhà cung cấp để biết chi phí mua theo từng nhà cung cấp.',
            'Xem so sánh giá để phát hiện cùng một vật tư có đơn giá khác nhau giữa các lần mua/nhà cung cấp.',
            'Xem báo cáo cấp phát để biết chi phí xuất cho từng cơ sở hoặc từng phiếu.',
            'Bấm Xuất Excel sau khi đã áp dụng bộ lọc đúng.',
        ],
        checkpoints: [
            'Số liệu báo cáo phụ thuộc trạng thái phiếu. Phiếu nháp hoặc chưa hoàn tất có thể không được tính đầy đủ.',
            'Chi phí cấp phát lấy từ phiếu cấp phát; chi phí mua lấy từ đề xuất mua/đơn hàng tùy API báo cáo.',
            'Nếu báo cáo trống, kiểm tra lại khoảng ngày và trạng thái.',
        ],
        commonMistakes: [
            'Xuất báo cáo khi chưa bấm áp dụng bộ lọc mới.',
            'So sánh giá nhưng nhà cung cấp bị nhập trùng tên nên kết quả bị tách nhiều dòng.',
            'Dùng báo cáo cấp phát để kiểm tồn kho. Tồn kho phải kiểm ở Kho vật tư.',
        ],
        notes: [
            'Khi gửi báo cáo cho quản lý, nên ghi rõ khoảng ngày, cơ sở và bộ lọc đã dùng để tránh hiểu sai số liệu.',
        ],
        related: ['material-inventory-history-adjust', 'purchase-order-full-flow', 'distribution-facility-transfer-flow'],
    },
    {
        id: 'permission-role-real-usage',
        title: 'Phân quyền thực tế khi triển khai nội bộ',
        category: 'admin',
        routes: ['/users', '/assets', '/materials/*'],
        keywords: ['phan quyen', 'admin', 'manager', 'staff', 'director', 'khong thay menu', 'tai khoan'],
        summary:
            'Phân quyền quyết định người dùng thấy menu nào và được làm thao tác nào. Khi triển khai thật cần phân rõ người nhập liệu, người duyệt, người xuất kho và người xem báo cáo.',
        prerequisites: [
            'Admin có quyền quản lý tài khoản.',
            'Danh sách cơ sở đã đúng để gán user.plantId.',
        ],
        steps: [
            'Vào Người dùng để tạo hoặc cập nhật tài khoản.',
            'Gán vai trò theo trách nhiệm: staff nhập liệu/xem dữ liệu cơ bản, manager xử lý và duyệt nghiệp vụ, director xem/duyệt cấp cao nếu có, admin quản trị hệ thống.',
            'Gán cơ sở cho tài khoản để các màn vật tư và báo cáo lọc đúng phạm vi.',
            'Với nghiệp vụ kho chính, kiểm tra tài khoản có plantId trùng cơ sở chính theo cấu hình VITE_MAIN_PLANT_ID nếu menu mua hàng/cấp phát không hiện.',
            'Sau khi đổi quyền hoặc cơ sở, yêu cầu người dùng đăng xuất rồi đăng nhập lại.',
            'Nếu người dùng không thấy nút thao tác, kiểm tra cả vai trò, cơ sở và trạng thái phiếu hiện tại.',
        ],
        checkpoints: [
            'Không cấp admin cho người chỉ cần tạo phiếu hoặc xem báo cáo.',
            'Người duyệt và người xuất kho nên là vai trò quản lý/kho được phân công rõ.',
            'Tài khoản tại cơ sở thường không nên thao tác như kho chính nếu không có trách nhiệm.',
        ],
        commonMistakes: [
            'Đổi vai trò nhưng người dùng chưa đăng nhập lại nên UI vẫn giữ quyền cũ.',
            'Gán sai cơ sở khiến không thấy dữ liệu hoặc thấy sai dữ liệu.',
        ],
        notes: [
            'Để vận hành thực tế, nên lập bảng phân quyền theo chức danh trước khi bàn giao hệ thống.',
        ],
    },
];

HELP_TOPICS.push(...ADVANCED_HELP_TOPICS);

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

    const results = HELP_TOPICS.map((topic) => {
        const haystack = normalizeText(
            [
                topic.title,
                topic.summary,
                topic.category,
                ...topic.keywords,
                ...(topic.prerequisites ?? []),
                ...topic.steps,
                ...(topic.checkpoints ?? []),
                ...(topic.commonMistakes ?? []),
                ...(topic.notes ?? []),
            ].join(' ')
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

    return results.length ? results : getRouteHelpTopics(pathname, limit);
};

import { Modal } from 'antd';
import { Flower2 } from 'lucide-react';
import { WOMENS_DAY_GREETING } from './notebook-event';

export default function NotebookWomensDayCard({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Modal
            open={open}
            title='Lời chúc 20/10'
            onCancel={onClose}
            footer={null}
            width={740}
            className='wn-wish-modal'
            destroyOnHidden
            centered
        >
            <div className='wn-wish-book'>
                <div className='wn-wish-art' aria-hidden='true'>
                    <span>20/10</span>
                    <img src='/brand/womens-day-bouquet-v2.webp' alt='' width={960} height={960} draggable={false} />
                </div>
                <div className='wn-wish-letter'>
                    <p className='wn-wish-recipient'>Gửi đến toàn thể chị em Hải Đăng</p>
                    <h3>
                        Chúc mừng ngày
                        <br />
                        Phụ nữ Việt Nam
                    </h3>
                    <p className='wn-wish-message'>{WOMENS_DAY_GREETING.text}</p>
                    <div className='wn-wish-sender'>
                        <img src='/brand/company-logo.png' alt='' width={30} height={30} />
                        <span>Hải Đăng</span>
                    </div>
                </div>
                <div className='wn-wish-cover' aria-hidden='true'>
                    <Flower2 size={34} strokeWidth={1} />
                    <span>20/10</span>
                </div>
            </div>
            <div className='wn-wish-footer'>
                <a href={WOMENS_DAY_GREETING.source} target='_blank' rel='noopener noreferrer'>
                    Nguồn lời chúc
                </a>
                <button type='button' onClick={onClose}>
                    Về sổ của tôi
                </button>
            </div>
        </Modal>
    );
}

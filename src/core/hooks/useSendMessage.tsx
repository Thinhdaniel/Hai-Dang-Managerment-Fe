import { App } from 'antd';
import type { NoticeType } from 'antd/es/message/interface';
import type { ReactNode } from 'react';

const useSendMessage = () => {
    const { message } = App.useApp();

    const sendMessage = (type: NoticeType, content: ReactNode, icon?: ReactNode, duration = 3) => {
        message.open({ type, content, duration, icon });
    };

    return { sendMessage };
};

export default useSendMessage;

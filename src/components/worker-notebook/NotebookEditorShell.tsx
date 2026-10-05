import { useEffect, useState, type ReactNode } from 'react';
import { Button, Drawer, Grid, Modal } from 'antd';
import { Check } from 'lucide-react';

type Props = {
    open: boolean;
    title: string;
    formId: string;
    saveLabel: string;
    saving: boolean;
    onClose: () => void;
    children: ReactNode;
};

export default function NotebookEditorShell({ open, title, formId, saveLabel, saving, onClose, children }: Props) {
    const screens = Grid.useBreakpoint();
    const [viewport, setViewport] = useState<{ height: number; inset: number }>();
    useEffect(() => {
        if (!open || !window.visualViewport) return;
        const visual = window.visualViewport;
        const update = () =>
            setViewport({
                height: Math.max(200, visual.height - 12),
                inset: Math.max(0, window.innerHeight - visual.height - visual.offsetTop),
            });
        update();
        visual.addEventListener('resize', update);
        visual.addEventListener('scroll', update);
        return () => {
            visual.removeEventListener('resize', update);
            visual.removeEventListener('scroll', update);
        };
    }, [open]);
    const footer = (
        <Button
            className='wn-save-button'
            type='primary'
            htmlType='submit'
            form={formId}
            size='large'
            block
            loading={saving}
            icon={<Check size={18} />}
        >
            {saveLabel}
        </Button>
    );
    if (screens.md)
        return (
            <Modal
                open={open}
                title={title}
                onCancel={onClose}
                width={540}
                footer={footer}
                maskClosable={!saving}
                closable={!saving}
                keyboard={!saving}
                className='wn-editor-modal'
                destroyOnHidden
            >
                {children}
            </Modal>
        );
    return (
        <Drawer
            open={open}
            title={title}
            placement='bottom'
            size='auto'
            onClose={onClose}
            footer={footer}
            maskClosable={!saving}
            closable={!saving}
            keyboard={!saving}
            rootClassName='wn-editor-drawer'
            destroyOnHidden
            styles={{
                wrapper: { maxHeight: viewport?.height ?? '90dvh', bottom: viewport?.inset ?? 0 },
                section: { maxHeight: 'inherit' },
                body: { minHeight: 0 },
            }}
        >
            {children}
        </Drawer>
    );
}

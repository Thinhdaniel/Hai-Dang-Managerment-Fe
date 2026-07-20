const NotFoundPage = () => {
    return (
        <main className='flex min-h-screen w-full items-center justify-center bg-slate-50 px-5'>
            <section className='w-full max-w-lg text-center'>
                <p className='text-sm font-semibold text-blue-600'>Không tìm thấy trang</p>
                <h1 className='mt-2 text-7xl font-black text-slate-900'>404</h1>
                <p className='mt-4 text-base leading-7 text-slate-500'>
                    Đường dẫn không tồn tại hoặc ứng dụng vừa được cập nhật. Hãy tải lại để nhận phiên bản mới nhất.
                </p>
                <div className='mt-7 flex flex-wrap justify-center gap-3'>
                    <button
                        type='button'
                        className='min-h-11 rounded-md border border-slate-300 bg-white px-5 font-semibold text-slate-700 shadow-sm'
                        onClick={() => window.location.reload()}
                    >
                        Tải lại
                    </button>
                    <a
                        href='/dashboard'
                        className='inline-flex min-h-11 items-center rounded-md bg-blue-600 px-5 font-semibold text-white shadow-sm'
                    >
                        Về trang chủ
                    </a>
                </div>
            </section>
        </main>
    );
};

export default NotFoundPage;

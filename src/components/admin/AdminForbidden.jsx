import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '../ui';

/**
 * TRANG KHÔNG CÓ QUYỀN (mục 5.9).
 * Hiện khi tài khoản thường mở /admin hoặc /admin/*.
 */
const AdminForbidden = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Không có quyền | Customer Radar';
  }, []);

  return (
    <div className="cx flex min-h-screen min-h-dvh items-center justify-center bg-canvas px-4">
      <main id="noi-dung" className="w-full max-w-md">
        <EmptyState
          variant="error"
          title="Tài khoản này không có quyền quản trị"
          description="Bàn điều khiển máy chủ chỉ mở cho quản trị viên."
          action={<Button onClick={() => navigate('/dashboard')}>Về Tổng quan</Button>}
        />
      </main>
    </div>
  );
};

export default AdminForbidden;

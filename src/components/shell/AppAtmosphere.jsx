import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Lớp không khí (K1-03): ba vùng sáng navy và xanh polo rất nhẹ phía sau app, để lớp kính có
 * thứ mà làm mờ. Không san hô, không tím. CSS ở index.css (.atmos): trôi theo cuộn của
 * main.main-content bằng animation-timeline; giảm chuyển động thì đứng yên; giảm trong suốt hoặc
 * tắt kính thì ẩn. Chỉ gắn trong vùng app, không ở trang giới thiệu.
 *
 * Bố cục (data-atmos) theo route để các trang không giống hệt nhau; trang nào cần bố cục khác
 * thì sửa bảng này.
 */
const ATMOS_BY_ROUTE = {
  '/dashboard': 'dashboard',
  '/insights': 'data',
  '/analytics': 'data',
  '/risk': 'data',
  '/feedbacks': 'work',
  '/live': 'work',
  '/data': 'work',
  '/trust': 'quiet',
  '/reports': 'quiet',
  '/settings': 'quiet',
  '/lab': 'quiet',
};

const AppAtmosphere = () => {
  const { pathname } = useLocation();
  return (
    <div className="atmos" data-atmos={ATMOS_BY_ROUTE[pathname] || 'dashboard'} aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
};

export default AppAtmosphere;

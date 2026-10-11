import React from 'react';
import { EmptyState, Button, GlassPanel } from './ui';

/**
 * Chặn lỗi hiển thị ở phạm vi MỘT trang. Không có lớp này, một lỗi render ở
 * bất kỳ biểu đồ nào (dữ liệu API thiếu một trường chẳng hạn) làm React gỡ
 * toàn bộ cây giao diện — người dùng chỉ thấy màn hình trắng, kể cả thanh
 * điều hướng để thoát ra trang khác.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lỗi hiển thị trang:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="cx">
        <GlassPanel>
          <EmptyState
            variant="error"
            title="Trang này gặp lỗi khi hiển thị"
            description={`Các trang khác vẫn dùng được. Chi tiết: ${this.state.error.message || 'không rõ'}`}
            action={<Button onClick={() => this.setState({ error: null })}>Thử lại</Button>}
          />
        </GlassPanel>
      </div>
    );
  }
}

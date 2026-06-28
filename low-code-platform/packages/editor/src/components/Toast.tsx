import React from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: '✓',
      iconBg: 'bg-green-100',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: '✕',
      iconBg: 'bg-red-100',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: 'ℹ',
      iconBg: 'bg-blue-100',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      icon: '⚠',
      iconBg: 'bg-yellow-100',
    },
  }[type];

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] animate-slide-in">
      <div className={`${styles.bg} ${styles.border} ${styles.text} border-2 px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 min-w-[320px] max-w-[500px]`}>
        <div className={`${styles.iconBg} rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0`}>
          <span className="text-lg font-bold">{styles.icon}</span>
        </div>
        <span className="flex-1 text-sm leading-relaxed whitespace-pre-line">{message}</span>
        <button
          onClick={onClose}
          className={`${styles.text} hover:opacity-70 text-xl leading-none flex-shrink-0`}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </div>,
    document.body
  );
};

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确认',
  cancelText = '取消',
  type = 'info',
}) => {
  const confirmBg = type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
  const iconStyles = type === 'danger'
    ? { bg: 'bg-red-100', text: 'text-red-600', icon: '⚠' }
    : { bg: 'bg-blue-100', text: 'text-blue-600', icon: 'ℹ' };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 animate-scale-in">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`${iconStyles.bg} ${iconStyles.text} rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0`}>
              <span className="text-2xl">{iconStyles.icon}</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{message}</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-xl border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 text-white rounded-lg font-medium transition-colors ${confirmBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Toast 管理器
let toastId = 0;
const activeToasts = new Map<number, () => void>();

export const toast = {
  success: (message: string) => showToast(message, 'success'),
  error: (message: string) => showToast(message, 'error'),
  info: (message: string) => showToast(message, 'info'),
  warning: (message: string) => showToast(message, 'warning'),
};

function showToast(message: string, type: ToastProps['type']) {
  const id = toastId++;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const close = () => {
    root.unmount();
    document.body.removeChild(container);
    activeToasts.delete(id);
  };

  activeToasts.set(id, close);

  root.render(<Toast message={message} type={type} onClose={close} />);
}

// Confirm 对话框
export function confirm(options: Omit<ConfirmDialogProps, 'onConfirm' | 'onCancel'>): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      document.body.removeChild(container);
    };

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    root.render(
      <ConfirmDialog
        {...options}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  });
}

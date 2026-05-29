import { useState, useCallback } from 'react';

let _addToast = null;

/** Call this from anywhere to show a toast */
export const toast = {
  success: (msg) => _addToast?.({ msg, type: 'success' }),
  error:   (msg) => _addToast?.({ msg, type: 'error' }),
  warn:    (msg) => _addToast?.({ msg, type: 'warn' }),
};

let _id = 0;

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  _addToast = useCallback(({ msg, type }) => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : t.type === 'warn' ? 'warn' : ''}`}>
          {t.type === 'success' && '✅ '}
          {t.type === 'error'   && '❌ '}
          {t.type === 'warn'    && '⚠️ '}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

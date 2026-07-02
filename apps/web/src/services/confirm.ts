export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

type ConfirmListener = (options: ConfirmOptions, resolve: (value: boolean) => void) => void;
let currentListener: ConfirmListener | null = null;

export const confirmService = {
  subscribe(listener: ConfirmListener) {
    currentListener = listener;
    return () => {
      if (currentListener === listener) {
        currentListener = null;
      }
    };
  },

  show(options: ConfirmOptions | string): Promise<boolean> {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      if (currentListener) {
        currentListener(opts, resolve);
      } else {
        // Fallback to native confirm if not subscribed
        const nativeConfirm = globalThis.confirm(opts.message);
        resolve(nativeConfirm);
      }
    });
  }
};

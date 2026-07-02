// Event-based Toast Notification Service
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastEvent {
  message: string;
  type: ToastType;
  id: number;
}

type ToastListener = (toast: ToastEvent) => void;
const listeners = new Set<ToastListener>();

export const toast = {
  subscribe(listener: ToastListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  
  show(message: string, type: ToastType = 'success') {
    const event: ToastEvent = {
      message,
      type,
      id: Date.now() + Math.random(),
    };
    listeners.forEach((l) => l(event));
  },

  success(message: string) {
    this.show(message, 'success');
  },

  error(message: string) {
    this.show(message, 'error');
  },

  warning(message: string) {
    this.show(message, 'warning');
  },

  info(message: string) {
    this.show(message, 'info');
  }
};

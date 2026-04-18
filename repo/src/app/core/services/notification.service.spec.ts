import '../../../test-setup';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  jest.useFakeTimers();

  it('shows and dismisses toasts', () => {
    const n = new NotificationService();
    const id = n.show('info', 'hi');
    expect(n.toasts().length).toBe(1);
    n.dismiss(id);
    expect(n.toasts().length).toBe(0);
  });

  it('auto-dismiss after ttl', () => {
    const n = new NotificationService();
    n.success('ok');
    jest.advanceTimersByTime(3000);
    expect(n.toasts().length).toBe(0);
  });

  it('error uses 5s ttl', () => {
    const n = new NotificationService();
    n.error('bad');
    jest.advanceTimersByTime(3000);
    expect(n.toasts().length).toBe(1);
    jest.advanceTimersByTime(2000);
    expect(n.toasts().length).toBe(0);
  });

  it('warning and info helpers', () => {
    const n = new NotificationService();
    expect(typeof n.warning('w')).toBe('string');
    expect(typeof n.info('i')).toBe('string');
  });

  it('log, markRead, clearMessages', () => {
    const n = new NotificationService();
    n.log('info', 't', 'b');
    expect(n.messages()[0].read).toBe(false);
    const id = n.messages()[0].id;
    n.markRead(id);
    expect(n.messages()[0].read).toBe(true);
    n.clearMessages();
    expect(n.messages()).toEqual([]);
  });
});
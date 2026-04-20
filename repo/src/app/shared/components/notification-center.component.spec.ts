import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { NotificationCenterComponent } from './notification-center.component';
import { NotificationService } from '../../core/services/notification.service';

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [NotificationCenterComponent] });
  const fixture = TestBed.createComponent(NotificationCenterComponent);
  const notif = TestBed.inject(NotificationService);
  return { fixture, notif };
}

describe('NotificationCenterComponent', () => {
  it('starts closed; toggle() flips the panel open/closed', () => {
    const { fixture } = mount();
    const c = fixture.componentInstance;
    expect(c.open()).toBe(false);
    c.toggle();
    expect(c.open()).toBe(true);
    c.toggle();
    expect(c.open()).toBe(false);
  });

  it('unreadCount reflects unread messages from the NotificationService', () => {
    const { fixture, notif } = mount();
    notif.log('info', 'Import complete', 'body');
    notif.log('warning', 'Near cap', 'body');
    expect(fixture.componentInstance.unreadCount()).toBe(2);
    const first = notif.messages()[0];
    notif.markRead(first.id);
    expect(fixture.componentInstance.unreadCount()).toBe(1);
  });

  it('formatTime returns a HH:MM string for the supplied timestamp', () => {
    const { fixture } = mount();
    // 2026-04-20T12:34:56Z — the output is UTC HH:MM, independent of local TZ.
    const ts = Date.UTC(2026, 3, 20, 12, 34, 56);
    expect(fixture.componentInstance.formatTime(ts)).toBe('12:34');
  });

  it('renders the bell button and shows the panel after toggle', () => {
    const { fixture, notif } = mount();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="notif-bell"]')).not.toBeNull();
    // Panel hidden initially.
    expect(el.querySelector('[data-testid="notif-panel"]')).toBeNull();
    // After toggling open, the empty-state message shows.
    fixture.componentInstance.toggle();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="notif-panel"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="notif-empty"]')).not.toBeNull();
    // Messages render when present.
    notif.log('info', 'Hello', 'Body');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid^="notif-msg-"]')).not.toBeNull();
  });
});

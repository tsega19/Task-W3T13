import '../../../test-setup';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AdminPanelComponent } from './admin-panel.component';
import { AdminService, AdminSettings } from './admin.service';
import { NotificationService } from '../../core/services/notification.service';

function mount(initial: AdminSettings, saveSpy = jest.fn(async () => undefined)) {
  TestBed.resetTestingModule();
  const settings = signal<AdminSettings>(initial);
  TestBed.configureTestingModule({
    imports: [AdminPanelComponent],
    providers: [
      { provide: AdminService, useValue: { settings, save: saveSpy } as unknown as AdminService },
      { provide: NotificationService, useValue: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } as unknown as NotificationService }
    ]
  });
  const fixture = TestBed.createComponent(AdminPanelComponent);
  return { fixture, saveSpy };
}

function empty(): AdminSettings {
  return {
    dictionaries: [],
    templates: [],
    tagPalette: [],
    announcements: [],
    channels: [],
    topics: [],
    featuredSlots: { maxSlots: 1, rotationDays: 14 }
  };
}

describe('AdminPanelComponent', () => {
  it('clones the service snapshot into a local draft (mutations do not bleed back)', () => {
    const source: AdminSettings = {
      dictionaries: [{ id: 'd1', term: 't', definition: 'x' }],
      templates: [{ id: 't1', name: 'n', body: 'b' }],
      tagPalette: ['design'],
      announcements: ['hello'],
      channels: [],
      topics: [],
      featuredSlots: { maxSlots: 1, rotationDays: 14 }
    };
    const { fixture } = mount(source);
    fixture.componentInstance.draft().announcements.push('new');
    expect(source.announcements).toEqual(['hello']);
    expect(source.tagPalette).toEqual(['design']);
  });

  it('addAnn / removeAnn mutate the announcements list and trigger a signal update', () => {
    const { fixture } = mount(empty());
    fixture.componentInstance.addAnn();
    expect(fixture.componentInstance.draft().announcements.length).toBe(1);
    fixture.componentInstance.removeAnn(0);
    expect(fixture.componentInstance.draft().announcements.length).toBe(0);
  });

  it('addTag rejects empty and duplicate tags, accepts unique trimmed values', () => {
    const { fixture } = mount(empty());
    const c = fixture.componentInstance;
    c.newTag = '   ';
    c.addTag();
    expect(c.draft().tagPalette).toEqual([]);
    c.newTag = 'alpha';
    c.addTag();
    expect(c.draft().tagPalette).toEqual(['alpha']);
    expect(c.newTag).toBe('');
    c.newTag = 'alpha';
    c.addTag();
    expect(c.draft().tagPalette).toEqual(['alpha']);
  });

  it('removeTag removes by index', () => {
    const { fixture } = mount({ ...empty(), tagPalette: ['a', 'b', 'c'] });
    fixture.componentInstance.removeTag(1);
    expect(fixture.componentInstance.draft().tagPalette).toEqual(['a', 'c']);
  });

  it('addDict / removeDict manage dictionary entries with generated ids', () => {
    const { fixture } = mount(empty());
    fixture.componentInstance.addDict();
    expect(fixture.componentInstance.draft().dictionaries.length).toBe(1);
    expect(fixture.componentInstance.draft().dictionaries[0].id).toBeTruthy();
    fixture.componentInstance.removeDict(0);
    expect(fixture.componentInstance.draft().dictionaries.length).toBe(0);
  });

  it('addTemplate / removeTemplate manage template entries with generated ids', () => {
    const { fixture } = mount(empty());
    fixture.componentInstance.addTemplate();
    expect(fixture.componentInstance.draft().templates.length).toBe(1);
    expect(fixture.componentInstance.draft().templates[0].id).toBeTruthy();
    fixture.componentInstance.removeTemplate(0);
    expect(fixture.componentInstance.draft().templates.length).toBe(0);
  });

  it('addChannel / removeChannel manage channel entries and cascade to topics/templates', () => {
    const { fixture } = mount(empty());
    const c = fixture.componentInstance;
    c.addChannel();
    c.addChannel();
    const chId = c.draft().channels[0].id;
    c.draft().topics.push({ id: 'tp1', channelId: chId, name: 'topic-1' });
    c.draft().templates.push({ id: 'tpl1', name: 'x', body: 'y', channelId: chId });
    c.removeChannel(0);
    expect(c.draft().channels.length).toBe(1);
    // Dependent topics are removed; dependent template channelId is cleared.
    expect(c.draft().topics.find((t) => t.channelId === chId)).toBeUndefined();
    expect(c.draft().templates[0].channelId).toBeUndefined();
  });

  it('addTopic is a no-op when there are no channels, and otherwise assigns the first channel', () => {
    const { fixture } = mount(empty());
    const c = fixture.componentInstance;
    c.addTopic();
    expect(c.draft().topics.length).toBe(0);
    c.addChannel();
    c.addTopic();
    expect(c.draft().topics.length).toBe(1);
    expect(c.draft().topics[0].channelId).toBe(c.draft().channels[0].id);
    c.removeTopic(0);
    expect(c.draft().topics.length).toBe(0);
  });

  it('save() clamps featuredSlots numbers to non-negative integers before forwarding', async () => {
    const save = jest.fn(async () => undefined);
    const { fixture } = mount({ ...empty(), featuredSlots: { maxSlots: -3, rotationDays: 1.9 } }, save);
    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        featuredSlots: { maxSlots: 0, rotationDays: 1 }
      })
    );
  });

  it('save() forwards the current draft to AdminService.save and surfaces a success toast', async () => {
    const save = jest.fn(async () => undefined);
    const { fixture } = mount(empty(), save);
    fixture.componentInstance.addAnn();
    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith(fixture.componentInstance.draft());
    const notif = TestBed.inject(NotificationService) as unknown as { success: jest.Mock };
    expect(notif.success).toHaveBeenCalledWith('Admin settings saved.');
  });

  it('renders cards for announcements, tag palette, dictionaries and templates', () => {
    const { fixture } = mount({
      dictionaries: [{ id: 'd', term: 't', definition: 'x' }],
      templates: [{ id: 't', name: 'n', body: 'b' }],
      tagPalette: ['alpha'],
      announcements: ['hi'],
      channels: [],
      topics: [],
      featuredSlots: { maxSlots: 1, rotationDays: 14 }
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Announcements');
    expect(el.textContent).toContain('Tag Palette');
    expect(el.textContent).toContain('Dictionaries');
    expect(el.textContent).toContain('Templates');
    expect(el.querySelector('[data-testid="admin-add-announcement"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="admin-add-tag"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="admin-add-dict"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="admin-add-template"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="admin-save"]')).not.toBeNull();
  });
});

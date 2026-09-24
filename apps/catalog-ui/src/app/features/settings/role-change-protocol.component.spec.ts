import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DocumentationApiService, RoleChangeEvent } from '../../core/documentation-api.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { RoleChangeProtocolComponent } from './role-change-protocol.component';

const event: RoleChangeEvent = {
  sequence: 12, occurredAt: '2026-09-24T09:00:00+00:00', actorUserId: 'daniel.wenger',
  actorName: 'Daniel Wenger', action: 'changed', scopeType: 'organization',
  scopeId: 'org-1', entityId: 'assignment-1', scopeName: 'armasuisse Immobilien',
  role: 'data_steward', subjectUserId: 'christian.man', subjectName: 'Christian Man',
  before: { userId: 'christian.man', role: 'data_owner' },
  after: { userId: 'christian.man', role: 'data_steward' },
};

describe('RoleChangeProtocolComponent', () => {
  const language = signal<'de' | 'fr' | 'it' | 'en'>('de');
  const roleChanges = vi.fn((_language: string, before?: number) => of(before ? {
    items: [{ ...event, sequence: 11, action: 'assigned' as const, before: null }], nextBefore: null,
  } : { items: [event], nextBefore: 12 }));

  beforeEach(() => {
    language.set('de'); roleChanges.mockClear();
    TestBed.configureTestingModule({
      imports: [RoleChangeProtocolComponent],
      providers: [
        provideRouter([]),
        { provide: DocumentationApiService, useValue: { roleChanges } },
        { provide: UserPreferencesService, useValue: { language } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('shows the sequence, actor, assignment change and older events', async () => {
    const fixture = TestBed.createComponent(RoleChangeProtocolComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.querySelector('tbody')?.textContent).toContain('12');
    expect(root.querySelector('tbody')?.textContent).toContain('Christian Man');
    expect(root.querySelector('tbody')?.textContent).toContain('Daniel Wenger');
    expect(root.querySelector('tbody')?.textContent).toContain('data_owner → data_steward');
    root.querySelector<HTMLButtonElement>('.more')!.click(); fixture.detectChanges();
    expect(roleChanges).toHaveBeenCalledWith('de', 12);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('filters the visible protocol and responds to language changes', async () => {
    const fixture = TestBed.createComponent(RoleChangeProtocolComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'unbekannt'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(root.querySelector('tbody')?.textContent).toContain('Keine passenden Einträge');
    language.set('fr'); fixture.detectChanges();
    expect(root.textContent).toContain('Modifications des rôles');
  });
});

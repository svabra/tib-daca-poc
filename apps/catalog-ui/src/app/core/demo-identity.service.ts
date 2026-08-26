import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

export interface DemoUser {
  id: string;
  displayName: string;
  organization: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  roles: string[];
  supervisorUserId?: string | null;
}

const KASSANDRA: DemoUser = {
  id: 'kassandra.valdata',
  displayName: 'Kassandra Valdata',
  organization: 'ESTV',
  email: 'kassandra.valdata@estv.admin.ch',
  phone: '+41 58 000 00 11',
  avatarUrl: '/assets/kassandra-valdata.webp',
  roles: ['data_owner', 'data_consumer'],
};
const POC_USERS: readonly DemoUser[] = [
  KASSANDRA,
  { id: 'ariane.keller', displayName: 'Ariane Keller', organization: 'ESTV', email: 'ariane.keller@estv.admin.ch', phone: '+41 58 000 00 12', avatarUrl: '/assets/data-owners/ariane-keller.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'beat.stalder', displayName: 'Beat Stalder', organization: 'Kanton St. Gallen', email: 'beat.stalder@sg.ch', phone: '+41 58 000 00 71', avatarUrl: '/assets/data-owners/beat-stalder.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'daniel.aebischer', displayName: 'Daniel Aebischer', organization: 'EFV', email: 'daniel.aebischer@efv.admin.ch', phone: '+41 58 000 00 51', avatarUrl: '/assets/data-owners/daniel-aebischer.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'joel.ruod', displayName: 'Joel Ruod', organization: 'ESTV', email: 'joel.ruod@estv.admin.ch', phone: '+41 58 000 00 82', avatarUrl: '/assets/data-owners/joel-ruod.webp', roles: ['data_analyst', 'data_owner'], supervisorUserId: 'thomas.kriegli' },
  { id: 'lea.hofmann', displayName: 'Lea Hofmann', organization: 'BAZG', email: 'lea.hofmann@bazg.admin.ch', phone: '+41 58 000 00 92', avatarUrl: '/assets/data-owners/lea-hofmann.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'lucien.morel', displayName: 'Lucien Morel', organization: 'Kanton Neuchâtel', email: 'lucien.morel@ne.ch', phone: '+41 58 000 00 43', avatarUrl: '/assets/data-owners/lucien-morel.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'noemie.rochat', displayName: 'Noémie Rochat', organization: 'Kanton Neuchâtel', email: 'noemie.rochat@ne.ch', phone: '+41 58 000 00 42', avatarUrl: '/assets/data-owners/noemie-rochat.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'sandro.wenger', displayName: 'Sandro Wenger', organization: 'BAZG', email: 'sandro.wenger@bazg.admin.ch', phone: '+41 58 000 00 91', avatarUrl: '/assets/data-owners/sandro-wenger.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'sarah.brunner', displayName: 'Sarah Brunner', organization: 'Kanton St. Gallen', email: 'sarah.brunner@sg.ch', phone: '+41 58 000 00 72', avatarUrl: '/assets/data-owners/sarah-brunner.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'sibilla.micheli', displayName: 'Sibilla Micheli', organization: 'VBS', email: 'sibilla.micheli@vbs.admin.ch', phone: null, avatarUrl: null, roles: ['data_owner', 'domain_register_owner', 'data_consumer'] },
  { id: 'simone.wyss', displayName: 'Simone Wyss', organization: 'EFV', email: 'simone.wyss@efv.admin.ch', phone: '+41 58 000 00 52', avatarUrl: '/assets/data-owners/simone-wyss.webp', roles: ['data_owner', 'data_consumer'] },
  { id: 'thomas.kriegli', displayName: 'Thomas Kriegli', organization: 'ESTV', email: 'thomas.kriegli@estv.admin.ch', phone: '+41 58 000 00 83', avatarUrl: '/assets/data-owners/thomas-kriegli.webp', roles: ['publication_approver', 'data_consumer'], supervisorUserId: null },
];
const POC_USER_IDS = new Set(POC_USERS.map((user) => user.id));

@Injectable({ providedIn: 'root' })
export class DemoIdentityService {
  private readonly http = inject(HttpClient);
  private readonly usersState = signal<readonly DemoUser[]>([KASSANDRA]);
  private readonly userIdState = signal(this.initialUserId());
  private directoryResolved = false;
  private pendingUserId: string | null = null;

  readonly users = this.usersState.asReadonly();
  readonly userId = this.userIdState.asReadonly();
  readonly user = computed(() => this.usersState().find((user) => user.id === this.userIdState()) ?? this.usersState()[0] ?? KASSANDRA);
  readonly headers = computed(() => new HttpHeaders({ 'X-DaCa-User': this.userIdState() }));

  constructor() {
    const initialUrl = window.location.href;
    const requestedUserId = this.requestedDemoUserId();
    this.http.get<DemoUser[]>('/api/v1/demo-users').pipe(catchError(() => of(POC_USERS))).subscribe((users) => {
      const available = users.length ? users : POC_USERS;
      this.usersState.set(available);
      this.directoryResolved = true;
      const preferredUserId = this.pendingUserId ?? requestedUserId;
      this.pendingUserId = null;
      if (preferredUserId && available.some((user) => user.id === preferredUserId)) {
        this.commitSelection(preferredUserId);
      } else if (!available.some((user) => user.id === this.userIdState())) {
        this.userIdState.set(available[0].id);
      }
      this.removeInitialDemoUserQueryParameter(requestedUserId, initialUrl);
    });
  }

  select(userId: string): void {
    if (this.usersState().some((user) => user.id === userId)) {
      this.commitSelection(userId);
      return;
    }
    if (!this.directoryResolved && POC_USER_IDS.has(userId)) this.pendingUserId = userId;
  }

  private commitSelection(userId: string): void {
    this.userIdState.set(userId);
    try { window.localStorage.setItem('daca-demo-user', userId); } catch { /* storage is optional */ }
  }

  private storedUserId(): string {
    try { return window.localStorage.getItem('daca-demo-user') ?? KASSANDRA.id; } catch { return KASSANDRA.id; }
  }

  private initialUserId(): string {
    const requested = this.requestedDemoUserId();
    return requested && POC_USER_IDS.has(requested) ? requested : this.storedUserId();
  }

  private requestedDemoUserId(): string | null {
    try { return new URL(window.location.href).searchParams.get('demoUser'); } catch { return null; }
  }

  private removeInitialDemoUserQueryParameter(initialUserId: string | null, initialUrl: string): void {
    if (!initialUserId) return;
    try {
      if (window.location.href !== initialUrl) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get('demoUser') !== initialUserId) return;
      url.searchParams.delete('demoUser');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* navigation cleanup is best effort */ }
  }
}

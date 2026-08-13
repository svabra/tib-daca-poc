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
}

const KASSANDRA: DemoUser = {
  id: 'kassandra.valdata',
  displayName: 'Kassandra Valdata',
  organization: 'Eidgenössische Steuerverwaltung ESTV',
  email: 'kassandra.valdata@estv.admin.ch',
  phone: '+41 58 000 00 11',
  avatarUrl: '/assets/kassandra-valdata.webp',
  roles: ['data_owner', 'data_consumer'],
};

@Injectable({ providedIn: 'root' })
export class DemoIdentityService {
  private readonly http = inject(HttpClient);
  private readonly usersState = signal<readonly DemoUser[]>([KASSANDRA]);
  private readonly userIdState = signal(this.storedUserId());

  readonly users = this.usersState.asReadonly();
  readonly userId = this.userIdState.asReadonly();
  readonly user = computed(() => this.usersState().find((user) => user.id === this.userIdState()) ?? this.usersState()[0] ?? KASSANDRA);
  readonly headers = computed(() => new HttpHeaders({ 'X-DaCa-User': this.userIdState() }));

  constructor() {
    this.http.get<DemoUser[]>('/api/v1/demo-users').pipe(catchError(() => of([KASSANDRA]))).subscribe((users) => {
      const available = users.length ? users : [KASSANDRA];
      this.usersState.set(available);
      if (!available.some((user) => user.id === this.userIdState())) this.userIdState.set(available[0].id);
    });
  }

  select(userId: string): void {
    if (!this.usersState().some((user) => user.id === userId)) return;
    this.userIdState.set(userId);
    try { window.localStorage.setItem('daca-demo-user', userId); } catch { /* storage is optional */ }
  }

  private storedUserId(): string {
    try { return window.localStorage.getItem('daca-demo-user') ?? KASSANDRA.id; } catch { return KASSANDRA.id; }
  }
}

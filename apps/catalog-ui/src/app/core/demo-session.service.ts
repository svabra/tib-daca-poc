import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { DemoIdentityService } from './demo-identity.service';
import { UserPreferencesService } from './user-preferences.service';

@Injectable({ providedIn: 'root' })
export class DemoSessionService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  private readonly preferences = inject(UserPreferencesService);
  readonly ready = signal(false);
  readonly activeUserId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  restore(): void {
    const requested = new URL(window.location.href).searchParams.get('demoUser');
    if (requested) { this.login(requested); return; }
    this.http.get<{ userId: string }>('/api/v1/session').subscribe({
      next: ({ userId }) => this.activate(userId),
      error: () => { this.activeUserId.set(null); this.ready.set(true); },
    });
  }

  login(userId: string): void {
    this.busy.set(true);
    this.error.set('');
    this.http.post<{ userId: string }>('/api/v1/session/login', { userId }).subscribe({
      next: ({ userId: selected }) => this.activate(selected),
      error: () => { this.busy.set(false); this.ready.set(true); this.error.set('Die lokale Anmeldung ist derzeit nicht verfügbar.'); },
    });
  }

  logout(): void {
    this.busy.set(true);
    this.http.post('/api/v1/session/logout', {}).subscribe({
      next: () => this.clear(),
      error: () => this.clear(),
    });
  }

  private activate(userId: string): void {
    this.identity.select(userId);
    this.preferences.restore(userId);
    this.activeUserId.set(userId);
    this.busy.set(false);
    this.ready.set(true);
  }

  private clear(): void {
    this.preferences.reset();
    this.activeUserId.set(null);
    this.busy.set(false);
    this.ready.set(true);
  }
}

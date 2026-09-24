import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

export type CatalogLanguage = 'de' | 'fr' | 'it' | 'en';
export type CatalogTheme = 'light' | 'dark';
type PreferenceName = 'language' | 'theme';
type PendingPreference = { name: PreferenceName; value: CatalogLanguage | CatalogTheme; previous?: CatalogLanguage };

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private userId = '';
  readonly language = signal<CatalogLanguage>('de');
  readonly theme = signal<CatalogTheme>('light');
  readonly pending = signal<PendingPreference | null>(null);
  readonly error = signal('');

  restore(userId: string): void {
    this.userId = userId;
    this.pending.set(null);
    this.error.set('');
    this.apply('language', 'de');
    this.apply('theme', 'light');
    for (const name of ['language', 'theme'] as const) this.restoreOne(name, userId);
  }

  reset(): void {
    this.userId = '';
    this.pending.set(null);
    this.error.set('');
    this.apply('language', 'de');
    this.apply('theme', 'light');
  }

  requestLanguage(value: string): void {
    if (!this.isLanguage(value) || value === this.language()) return;
    const pending = this.pending();
    this.pending.set({ name: 'language', value, previous: pending?.name === 'language' ? pending.previous : this.language() });
    this.apply('language', value);
  }

  toggleTheme(): void {
    this.requestTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  requestTheme(value: CatalogTheme): void {
    if (value === this.theme()) return;
    this.pending.set({ name: 'theme', value });
  }

  cancel(): void {
    const pending = this.pending();
    if (pending?.name === 'language' && pending.previous) this.apply('language', pending.previous);
    this.pending.set(null);
    this.error.set('');
  }

  savePending(scope: 'device' | 'profile'): void {
    const pending = this.pending();
    if (!pending || !this.userId) return;
    this.error.set('');
    if (scope === 'device') {
      try { localStorage.setItem(this.key(pending.name), pending.value); } catch { /* Optional storage. */ }
      this.apply(pending.name, pending.value);
      this.pending.set(null);
      return;
    }
    this.http.put<{ value: string }>(`/api/v1/me/preferences/${pending.name}`, { value: pending.value }, { headers: this.headers() }).subscribe({
      next: ({ value }) => {
        try { localStorage.removeItem(this.key(pending.name)); } catch { /* Optional storage. */ }
        this.apply(pending.name, value);
        this.pending.set(null);
      },
      error: () => this.error.set('Die Einstellung konnte nicht im Benutzerprofil gespeichert werden.'),
    });
  }

  private restoreOne(name: PreferenceName, userId: string): void {
    let deviceValue: string | null = null;
    try { deviceValue = localStorage.getItem(this.key(name)); } catch { /* Optional storage. */ }
    if (deviceValue && this.valid(name, deviceValue)) {
      this.apply(name, deviceValue);
      return;
    }
    this.http.get<{ value: string }>(`/api/v1/me/preferences/${name}`, { headers: this.headers() }).subscribe({
      next: ({ value }) => { if (this.userId === userId && this.pending()?.name !== name) this.apply(name, value); },
      error: () => { /* Default remains active when demo profile storage is unavailable. */ },
    });
  }

  private key(name: PreferenceName): string { return `daca.preference.${this.userId}.${name}`; }
  private headers(): HttpHeaders { return new HttpHeaders({ 'X-DaCa-User': this.userId }); }
  private isLanguage(value: string): value is CatalogLanguage { return ['de', 'fr', 'it', 'en'].includes(value); }
  private valid(name: PreferenceName, value: string): boolean { return name === 'language' ? this.isLanguage(value) : value === 'light' || value === 'dark'; }
  private apply(name: PreferenceName, value: string): void {
    if (!this.valid(name, value)) return;
    if (name === 'language') {
      this.language.set(value as CatalogLanguage);
      this.document.documentElement.lang = value;
    } else {
      this.theme.set(value as CatalogTheme);
      this.document.documentElement.dataset['dacaTheme'] = value;
    }
  }
}

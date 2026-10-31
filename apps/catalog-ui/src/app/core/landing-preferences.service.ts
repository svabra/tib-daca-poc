import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { DemoIdentityService } from './demo-identity.service';

@Injectable({ providedIn: 'root' })
export class LandingPreferencesService {
  private readonly identity = inject(DemoIdentityService);
  private readonly state = signal({ userId: '', visible: true });
  readonly storageError = signal(false);
  readonly welcomeVisible = computed(() => this.state().userId === this.identity.userId() ? this.state().visible : true);

  constructor() {
    effect(() => {
      const userId = this.identity.userId();
      let visible = true;
      try { visible = localStorage.getItem(this.key(userId)) !== 'hidden'; } catch { /* Browser-local preferences are optional. */ }
      this.state.set({ userId, visible });
      this.storageError.set(false);
    });
  }

  setWelcome(visible: boolean): void {
    const userId = this.identity.userId();
    this.storageError.set(false);
    try { localStorage.setItem(this.key(userId), visible ? 'shown' : 'hidden'); } catch { this.storageError.set(true); }
    this.state.set({ userId, visible });
  }

  private key(userId: string): string { return `daca.preference.${userId || 'guest'}.welcome-intro`; }
}

import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  EnvironmentProviders,
  Injectable,
  InjectionToken,
  PLATFORM_ID,
  computed,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DACA_VERSION } from './version';

export type DacaAppId = 'catalog-ui' | 'control-plane-ui';
export type DacaAppUpdatePhase = 'idle' | 'installing' | 'ready' | 'reloading';

export interface DacaAppUpdateConfig {
  readonly appId: DacaAppId;
  readonly checkIntervalMs?: number;
}

export interface DacaAppUpdateSnapshot {
  readonly phase: DacaAppUpdatePhase;
  readonly latestHash: string | null;
  readonly targetVersion: string | null;
}

export interface DacaAppUpdateRuntime {
  readonly isBrowser: boolean;
  readonly documentTarget: EventTarget | null;
  readonly windowTarget: EventTarget | null;
  readonly serviceWorkerTarget: EventTarget | null;
  hasServiceWorkerController(): boolean;
  isOnline(): boolean;
  isDocumentVisible(): boolean;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(handle: number): void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
  readSessionValue(key: string): string | null;
  writeSessionValue(key: string, value: string): void;
  reload(): void;
}

const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const RELOAD_DELAY_MS = 550;
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const DACA_APP_UPDATE_CONFIG = new InjectionToken<DacaAppUpdateConfig>('DACA_APP_UPDATE_CONFIG');

export const DACA_APP_UPDATE_RUNTIME = new InjectionToken<DacaAppUpdateRuntime>('DACA_APP_UPDATE_RUNTIME', {
  factory: () => {
    const document = inject(DOCUMENT);
    const platformId = inject(PLATFORM_ID);
    const browserWindow = document.defaultView;
    const serviceWorker = browserWindow?.navigator.serviceWorker ?? null;

    return {
      isBrowser: isPlatformBrowser(platformId) && browserWindow !== null,
      documentTarget: document,
      windowTarget: browserWindow,
      serviceWorkerTarget: serviceWorker,
      hasServiceWorkerController: () => serviceWorker?.controller !== null && serviceWorker?.controller !== undefined,
      isOnline: () => browserWindow?.navigator.onLine !== false,
      isDocumentVisible: () => document.visibilityState === 'visible',
      setInterval: (callback, delay) => browserWindow?.setInterval(callback, delay) ?? -1,
      clearInterval: (handle) => browserWindow?.clearInterval(handle),
      setTimeout: (callback, delay) => browserWindow?.setTimeout(callback, delay) ?? -1,
      clearTimeout: (handle) => browserWindow?.clearTimeout(handle),
      readSessionValue: (key) => {
        try {
          return browserWindow?.sessionStorage.getItem(key) ?? null;
        } catch {
          return null;
        }
      },
      writeSessionValue: (key, value) => {
        try {
          browserWindow?.sessionStorage.setItem(key, value);
        } catch {
          // A blocked session store must never prevent an otherwise safe update.
        }
      },
      reload: () => document.location.reload(),
    } satisfies DacaAppUpdateRuntime;
  },
});

/**
 * Coordinates Angular service-worker updates without activating a new bundle
 * inside a running application. A ready bundle is adopted only by a full-page
 * reload, which keeps lazy chunks and the application shell on one version.
 */
@Injectable()
export class DacaAppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly config = inject(DACA_APP_UPDATE_CONFIG);
  private readonly runtime = inject(DACA_APP_UPDATE_RUNTIME);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mutableState = signal<DacaAppUpdateSnapshot>({
    phase: 'idle',
    latestHash: null,
    targetVersion: null,
  });

  readonly state = this.mutableState.asReadonly();
  readonly updateReady = computed(() => this.state().phase === 'ready');
  readonly updating = computed(() => this.state().phase === 'installing' || this.state().phase === 'reloading');
  readonly targetVersion = computed(() => this.state().targetVersion);
  readonly currentVersion = DACA_VERSION;

  private initialized = false;
  private startupCheckPending = true;
  private startupInteractionDetected = false;
  private checkInFlight = false;
  private interactionCleanups: Array<() => void> = [];
  private lifecycleCleanups: Array<() => void> = [];
  private intervalHandle: number | null = null;
  private reloadHandle: number | null = null;

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (!this.runtime.isBrowser || !this.swUpdate.isEnabled) {
      this.finishStartupCheck();
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleVersionEvent(event));
    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.handleUnrecoverableState());

    this.listenForStartupInteraction();
    this.listenForLaterChecks();
    this.destroyRef.onDestroy(() => this.dispose());

    if (this.runtime.hasServiceWorkerController()) {
      void this.checkForUpdates(true);
    } else {
      // A first-ever PWA visit has no controlling worker yet and therefore no
      // older application version to replace. Future checks are session checks.
      this.finishStartupCheck();
    }
  }

  checkNow(): Promise<void> {
    return this.checkForUpdates(false);
  }

  reloadToLatest(): void {
    this.reloadReadyUpdate();
  }

  private reloadReadyUpdate(): void {
    const update = this.state();
    if (update.phase !== 'ready' || !update.latestHash) {
      return;
    }

    this.rememberReloadedHash(update.latestHash);
    this.mutableState.set({ ...update, phase: 'reloading' });
    this.reloadHandle = this.runtime.setTimeout(() => this.runtime.reload(), RELOAD_DELAY_MS);
  }

  private async checkForUpdates(initial: boolean): Promise<void> {
    if (
      this.checkInFlight
      || this.state().phase !== 'idle'
      || !this.runtime.hasServiceWorkerController()
      || !this.runtime.isOnline()
    ) {
      if (initial) {
        this.finishStartupCheck();
      }
      return;
    }

    this.checkInFlight = true;
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      this.failSafely();
    } finally {
      this.checkInFlight = false;
      if (initial) {
        this.finishStartupCheck();
      }
    }
  }

  private handleVersionEvent(event: VersionEvent): void {
    switch (event.type) {
      case 'VERSION_DETECTED': {
        if (this.startupCheckPending && !this.startupInteractionDetected) {
          this.mutableState.set({
            phase: 'installing',
            latestHash: event.version.hash,
            targetVersion: this.readTargetVersion(event.version.appData),
          });
        }
        break;
      }
      case 'VERSION_READY': {
        if (this.state().phase === 'reloading' && this.state().latestHash === event.latestVersion.hash) {
          break;
        }
        const ready: DacaAppUpdateSnapshot = {
          phase: 'ready',
          latestHash: event.latestVersion.hash,
          targetVersion: this.readTargetVersion(event.latestVersion.appData),
        };
        this.mutableState.set(ready);

        break;
      }
      case 'VERSION_INSTALLATION_FAILED':
        this.failSafely(event.version.hash);
        break;
      case 'NO_NEW_VERSION_DETECTED':
        break;
    }
  }

  private readTargetVersion(appData: object | undefined): string | null {
    if (!appData || typeof appData !== 'object') {
      return null;
    }
    const candidate = appData as Record<string, unknown>;
    return candidate['schemaVersion'] === 1
      && candidate['appId'] === this.config.appId
      && typeof candidate['releaseVersion'] === 'string'
      && RELEASE_VERSION_PATTERN.test(candidate['releaseVersion'])
        ? candidate['releaseVersion']
        : null;
  }

  private listenForStartupInteraction(): void {
    const markInteraction = () => {
      this.startupInteractionDetected = true;
    };
    for (const eventName of ['pointerdown', 'keydown', 'input', 'submit']) {
      this.addListener(this.runtime.documentTarget, eventName, markInteraction, this.interactionCleanups, true);
    }
  }

  private listenForLaterChecks(): void {
    this.addListener(this.runtime.windowTarget, 'online', () => void this.checkForUpdates(false), this.lifecycleCleanups);
    this.addListener(this.runtime.documentTarget, 'visibilitychange', () => {
      if (this.runtime.isDocumentVisible()) {
        void this.checkForUpdates(false);
      }
    }, this.lifecycleCleanups);
    this.addListener(this.runtime.serviceWorkerTarget, 'controllerchange', () => void this.checkForUpdates(false), this.lifecycleCleanups);

    const interval = this.config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    if (interval > 0) {
      this.intervalHandle = this.runtime.setInterval(() => void this.checkForUpdates(false), interval);
    }
  }

  private addListener(
    target: EventTarget | null,
    eventName: string,
    listener: EventListener,
    cleanupList: Array<() => void>,
    capture = false,
  ): void {
    if (!target) {
      return;
    }
    target.addEventListener(eventName, listener, { capture, passive: true });
    cleanupList.push(() => target.removeEventListener(eventName, listener, capture));
  }

  private finishStartupCheck(): void {
    this.startupCheckPending = false;
    for (const cleanup of this.interactionCleanups.splice(0)) {
      cleanup();
    }
  }

  private failSafely(failedHash?: string): void {
    const current = this.state();
    if (!failedHash || current.latestHash === failedHash) {
      this.mutableState.set({ phase: 'idle', latestHash: null, targetVersion: null });
    }
  }

  private handleUnrecoverableState(): void {
    const key = `daca.app-update.unrecoverable.${this.config.appId}.${DACA_VERSION}`;
    if (this.runtime.readSessionValue(key) === 'reloaded') {
      if (this.state().phase !== 'reloading') {
        this.failSafely();
      }
      return;
    }
    this.runtime.writeSessionValue(key, 'reloaded');
    if (this.runtime.readSessionValue(key) !== 'reloaded') {
      this.failSafely();
      return;
    }
    this.mutableState.set({ phase: 'reloading', latestHash: null, targetVersion: null });
    this.reloadHandle = this.runtime.setTimeout(() => this.runtime.reload(), RELOAD_DELAY_MS);
  }

  private reloadStorageKey(): string {
    return `daca.app-update.reloaded-hash.${this.config.appId}`;
  }

  private rememberReloadedHash(hash: string): void {
    this.runtime.writeSessionValue(this.reloadStorageKey(), hash);
  }

  private dispose(): void {
    for (const cleanup of [...this.interactionCleanups, ...this.lifecycleCleanups]) {
      cleanup();
    }
    this.interactionCleanups = [];
    this.lifecycleCleanups = [];
    if (this.intervalHandle !== null) {
      this.runtime.clearInterval(this.intervalHandle);
    }
    if (this.reloadHandle !== null) {
      this.runtime.clearTimeout(this.reloadHandle);
    }
  }
}

export function provideDacaAppUpdates(config: DacaAppUpdateConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: DACA_APP_UPDATE_CONFIG, useValue: config },
    DacaAppUpdateService,
    provideEnvironmentInitializer(() => inject(DacaAppUpdateService).initialize()),
  ]);
}

import { TestBed } from '@angular/core/testing';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import {
  DACA_APP_UPDATE_CONFIG,
  DACA_APP_UPDATE_RUNTIME,
  DacaAppUpdateRuntime,
  DacaAppUpdateService,
} from '../../../../packages/design-system/src/lib/app-update.service';

class SwUpdateStub {
  readonly isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<UnrecoverableStateEvent>();
  readonly checkForUpdate = vi.fn().mockResolvedValue(false);
}

class UpdateRuntimeStub implements DacaAppUpdateRuntime {
  readonly isBrowser = true;
  readonly documentTarget = new EventTarget();
  readonly windowTarget = new EventTarget();
  readonly serviceWorkerTarget = new EventTarget();
  readonly storage = new Map<string, string>();
  readonly reload = vi.fn();
  controller = true;
  online = true;
  visible = true;
  storageAvailable = true;
  private nextTimer = 1;
  private readonly timeouts = new Map<number, () => void>();
  private readonly intervals = new Map<number, () => void>();

  hasServiceWorkerController(): boolean { return this.controller; }
  isOnline(): boolean { return this.online; }
  isDocumentVisible(): boolean { return this.visible; }
  setInterval(callback: () => void): number {
    const handle = this.nextTimer++;
    this.intervals.set(handle, callback);
    return handle;
  }
  clearInterval(handle: number): void { this.intervals.delete(handle); }
  setTimeout(callback: () => void): number {
    const handle = this.nextTimer++;
    this.timeouts.set(handle, callback);
    return handle;
  }
  clearTimeout(handle: number): void { this.timeouts.delete(handle); }
  readSessionValue(key: string): string | null { return this.storageAvailable ? this.storage.get(key) ?? null : null; }
  writeSessionValue(key: string, value: string): void {
    if (this.storageAvailable) {
      this.storage.set(key, value);
    }
  }
  runTimeouts(): void {
    const callbacks = [...this.timeouts.values()];
    this.timeouts.clear();
    callbacks.forEach((callback) => callback());
  }
  runIntervals(): void { [...this.intervals.values()].forEach((callback) => callback()); }
}

function readyEvent(hash = 'new-hash', appData: object = {
  schemaVersion: 1,
  appId: 'catalog-ui',
  releaseVersion: '0.1.13',
}): VersionEvent {
  return {
    type: 'VERSION_READY',
    currentVersion: { hash: 'old-hash' },
    latestVersion: { hash, appData },
  };
}

describe('DacaAppUpdateService', () => {
  let service: DacaAppUpdateService;
  let swUpdate: SwUpdateStub;
  let runtime: UpdateRuntimeStub;

  beforeEach(() => {
    swUpdate = new SwUpdateStub();
    runtime = new UpdateRuntimeStub();
    TestBed.configureTestingModule({
      providers: [
        DacaAppUpdateService,
        { provide: SwUpdate, useValue: swUpdate },
        { provide: DACA_APP_UPDATE_CONFIG, useValue: { appId: 'catalog-ui', checkIntervalMs: 0 } },
        { provide: DACA_APP_UPDATE_RUNTIME, useValue: runtime },
      ],
    });
    service = TestBed.inject(DacaAppUpdateService);
  });

  it('blocks an untouched startup while installing and reloads only after VERSION_READY', () => {
    swUpdate.checkForUpdate.mockReturnValue(new Promise(() => undefined));
    service.initialize();

    swUpdate.versionUpdates.next({
      type: 'VERSION_DETECTED',
      version: {
        hash: 'new-hash',
        appData: { schemaVersion: 1, appId: 'catalog-ui', releaseVersion: '0.1.13' },
      },
    });
    expect(service.state()).toEqual({ phase: 'installing', latestHash: 'new-hash', targetVersion: '0.1.13' });
    expect(runtime.reload).not.toHaveBeenCalled();

    swUpdate.versionUpdates.next(readyEvent());
    expect(service.state().phase).toBe('reloading');
    expect(runtime.reload).not.toHaveBeenCalled();
    swUpdate.versionUpdates.next(readyEvent());
    expect(service.state().phase).toBe('reloading');

    runtime.runTimeouts();
    expect(runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('offers a ready update manually when the person interacted during the startup check', () => {
    swUpdate.checkForUpdate.mockReturnValue(new Promise(() => undefined));
    service.initialize();
    runtime.documentTarget.dispatchEvent(new Event('pointerdown'));
    swUpdate.versionUpdates.next(readyEvent());

    expect(service.state()).toEqual({ phase: 'ready', latestHash: 'new-hash', targetVersion: '0.1.13' });
    expect(runtime.reload).not.toHaveBeenCalled();

    service.reloadToLatest();
    expect(service.state().phase).toBe('reloading');
    runtime.runTimeouts();
    expect(runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('does not auto-reload without a readable session loop guard', () => {
    runtime.storageAvailable = false;
    swUpdate.checkForUpdate.mockReturnValue(new Promise(() => undefined));
    service.initialize();
    swUpdate.versionUpdates.next(readyEvent());

    expect(service.state().phase).toBe('ready');
    runtime.runTimeouts();
    expect(runtime.reload).not.toHaveBeenCalled();
  });

  it('keeps the running version usable when installation fails', () => {
    swUpdate.checkForUpdate.mockReturnValue(new Promise(() => undefined));
    service.initialize();
    swUpdate.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'broken-hash' } });
    expect(service.state().phase).toBe('installing');

    swUpdate.versionUpdates.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: { hash: 'broken-hash' },
      error: 'private worker failure',
    });
    expect(service.state()).toEqual({ phase: 'idle', latestHash: null, targetVersion: null });
    runtime.runTimeouts();
    expect(runtime.reload).not.toHaveBeenCalled();
  });

  it('accepts only exact app metadata and never shows technical hashes as a version', () => {
    swUpdate.checkForUpdate.mockReturnValue(new Promise(() => undefined));
    service.initialize();
    runtime.documentTarget.dispatchEvent(new Event('keydown'));
    swUpdate.versionUpdates.next(readyEvent('new-hash', {
      schemaVersion: 1,
      appId: 'another-ui',
      releaseVersion: '0.1.13-beta.1',
    }));

    expect(service.state().targetVersion).toBeNull();
    expect(service.state().latestHash).toBe('new-hash');
  });

  it('keeps a repeated ready hash visible for manual retry without auto-reloading', () => {
    runtime.storage.set('daca.app-update.reloaded-hash.catalog-ui', 'new-hash');
    swUpdate.checkForUpdate.mockReturnValue(new Promise(() => undefined));
    service.initialize();
    swUpdate.versionUpdates.next(readyEvent());

    expect(service.state()).toEqual({ phase: 'ready', latestHash: 'new-hash', targetVersion: '0.1.13' });
    runtime.runTimeouts();
    expect(runtime.reload).not.toHaveBeenCalled();

    service.reloadToLatest();
    runtime.runTimeouts();
    expect(runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('guard-reloads an unrecoverable client only once per running release', () => {
    service.initialize();
    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'private technical reason' });
    expect(service.state().phase).toBe('reloading');
    runtime.runTimeouts();
    expect(runtime.reload).toHaveBeenCalledTimes(1);

    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'again' });
    runtime.runTimeouts();
    expect(runtime.reload).toHaveBeenCalledTimes(1);
  });

  it('checks again when returning online or visible while remaining quiet offline', async () => {
    runtime.online = false;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DacaAppUpdateService,
        { provide: SwUpdate, useValue: swUpdate },
        { provide: DACA_APP_UPDATE_CONFIG, useValue: { appId: 'catalog-ui', checkIntervalMs: 25 } },
        { provide: DACA_APP_UPDATE_RUNTIME, useValue: runtime },
      ],
    });
    service = TestBed.inject(DacaAppUpdateService);
    service.initialize();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();

    runtime.windowTarget.dispatchEvent(new Event('online'));
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    runtime.online = true;
    runtime.windowTarget.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1));

    runtime.visible = false;
    runtime.documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
    runtime.visible = true;
    runtime.documentTarget.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(2));

    runtime.runIntervals();
    await vi.waitFor(() => expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(3));
  });
});

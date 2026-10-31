import { signal } from '@angular/core';

/** Native fullscreen with a viewport fallback, matching the Mapping editor. */
export class CanvasFullscreen {
  readonly active = signal(false);
  private previousOverflow: string | null = null;
  private trigger: HTMLElement | null = null;
  private native = false;
  constructor(private readonly root: () => HTMLElement | null) {}

  async toggle(trigger: HTMLElement | null = null): Promise<void> {
    if (this.active()) return this.exit();
    const root = this.root(); if (!root) return;
    this.trigger = trigger;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.active.set(true);
    try {
      if (root.requestFullscreen && document.fullscreenEnabled !== false) await root.requestFullscreen();
    } catch { /* Keep the viewport fallback usable when native fullscreen is denied. */ }
    if (!this.active()) {
      if (document.fullscreenElement === root) { try { await document.exitFullscreen?.(); } catch {} }
      return;
    }
    this.native = document.fullscreenElement === root;
    queueMicrotask(() => this.trigger?.focus({ preventScroll: true }));
  }

  async exit(): Promise<void> {
    const root = this.root();
    // Always release the viewport and scroll lock, even if native exit rejects.
    this.restore();
    if (root && document.fullscreenElement === root) { try { await document.exitFullscreen?.(); } catch {} }
    this.trigger?.focus({ preventScroll: true });
  }

  changed(): void {
    if (this.root() && document.fullscreenElement === this.root()) this.native = true;
    else if (this.native) { this.restore(); this.trigger?.focus({ preventScroll: true }); }
  }

  trapTab(event: KeyboardEvent): void {
    if (!this.active() || event.defaultPrevented || event.key !== 'Tab') return;
    const root = this.root(); if (!root) return;
    const dialog = event.target instanceof Element ? event.target.closest('dialog[open],[aria-modal="true"]') : null;
    if (dialog && dialog !== root) return;
    const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0 && !element.closest('[hidden],[inert]'));
    const first = controls[0], last = controls.at(-1); if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }

  destroy(): void {
    const root = this.root(); this.restore();
    if (root && document.fullscreenElement === root) void document.exitFullscreen?.().catch(() => {});
  }
  private restore(): void {
    this.active.set(false); this.native = false;
    if (this.previousOverflow !== null) { document.body.style.overflow = this.previousOverflow; this.previousOverflow = null; }
  }
}

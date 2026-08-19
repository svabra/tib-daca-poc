import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly document = inject(DOCUMENT);

  async writeText(value: string): Promise<void> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(value);
        return;
      } catch {
        // Restricted browser contexts can still use the local selection fallback.
      }
    }

    const textarea = this.document.createElement('textarea');
    textarea.value = value;
    textarea.readOnly = true;
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-10000px';
    textarea.style.top = '0';
    this.document.body.appendChild(textarea);
    textarea.select();
    const copied = typeof this.document.execCommand === 'function'
      && this.document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard is unavailable');
  }
}

import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, EmbeddedViewRef, HostListener, inject, input, OnDestroy, TemplateRef, ViewContainerRef } from '@angular/core';

let tooltipSequence = 0;

/** Reuses the catalog's glossary tooltip appearance for ordinary controls and canvas cards. */
@Directive({ selector: '[dacaTooltip]', standalone: true })
export class TooltipDirective implements OnDestroy {
  readonly dacaTooltip = input('');
  /** Interactive summaries retain the shared tooltip surface and support focusable links. */
  readonly dacaTooltipContent = input<TemplateRef<unknown> | null>(null);
  private readonly document = inject(DOCUMENT);
  private readonly views = inject(ViewContainerRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private tooltip: HTMLDivElement | null = null;
  private contentView: EmbeddedViewRef<unknown> | null = null;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private readonly id = `daca-tooltip-${++tooltipSequence}`;
  private readonly onScroll = (event: Event) => {
    if (this.tooltip) {
      if (this.dacaTooltipContent() && this.tooltip.contains(event.target as Node)) return;
      const host = this.host.nativeElement, rect = host.getBoundingClientRect();
      const active = this.document.activeElement;
      if ((host.contains(active) || this.tooltip.contains(active)) && rect.bottom > 0 && rect.top < this.document.defaultView!.innerHeight
        && rect.right > 0 && rect.left < this.document.defaultView!.innerWidth) {
        this.position(); return;
      }
    }
    this.close();
  };

  @HostListener('mouseenter')
  @HostListener('focusin')
  open(): void {
    this.cancelClose();
    if (this.tooltip) return;
    this.close();
    const text = this.dacaTooltip().trim();
    const content = this.dacaTooltipContent();
    if (!text && !content) return;
    const tooltip = this.document.createElement('div');
    tooltip.id = this.id;
    tooltip.className = 'daca-glossary-tooltip is-visible';
    tooltip.setAttribute('role', content ? 'dialog' : 'tooltip');
    if (content) tooltip.setAttribute('aria-label', text || 'Zusammenfassung');
    tooltip.style.pointerEvents = content ? 'auto' : 'none';
    tooltip.style.zIndex = '2400';
    if (content) {
      this.contentView = this.views.createEmbeddedView(content);
      this.contentView.detectChanges();
      tooltip.append(...this.contentView.rootNodes);
      tooltip.classList.add('is-interactive');
      tooltip.addEventListener('mouseenter', () => this.cancelClose());
      tooltip.addEventListener('mouseleave', () => {
        const active = this.document.activeElement;
        if (!tooltip.contains(active) && !this.host.nativeElement.contains(active)) this.scheduleClose();
      });
      tooltip.addEventListener('focusin', () => this.cancelClose());
      tooltip.addEventListener('focusout', event => this.leaveFocus(event));
      tooltip.addEventListener('keydown', event => {
        if (event.key === 'Tab' && event.shiftKey && event.target === tooltip.querySelector('a,button,[tabindex="0"]')) {
          event.preventDefault(); this.host.nativeElement.focus();
        }
      });
    } else tooltip.textContent = text;
    (this.document.fullscreenElement ?? this.document.body).append(tooltip);
    this.tooltip = tooltip;
    const host = this.host.nativeElement;
    host.setAttribute('aria-describedby', [host.getAttribute('aria-describedby'), this.id].filter(Boolean).join(' '));
    if (content) { host.setAttribute('aria-controls', this.id); host.setAttribute('aria-expanded', 'true'); }
    this.position();
    this.document.addEventListener('scroll', this.onScroll, true);
  }

  private position(): void {
    const tooltip = this.tooltip;
    if (!tooltip) return;
    const rect = this.host.nativeElement.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
    const width = this.document.documentElement.clientWidth || this.document.defaultView!.innerWidth;
    const height = this.document.defaultView!.innerHeight;
    tooltip.style.left = `${Math.max(12, Math.min(rect.left, width - bounds.width - 12))}px`;
    tooltip.style.top = `${Math.max(12, rect.bottom + bounds.height + 20 < height ? rect.bottom + 8 : rect.top - bounds.height - 8)}px`;
  }

  @HostListener('mouseleave')
  leavePointer(): void {
    if (!this.dacaTooltipContent()) this.close();
    else if (!this.host.nativeElement.contains(this.document.activeElement)) this.scheduleClose();
  }

  @HostListener('focusout', ['$event'])
  leaveFocus(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (this.host.nativeElement.contains(next) || this.tooltip?.contains(next))) return;
    this.close();
  }

  @HostListener('pointerdown')
  pointerDown(): void { if (!this.dacaTooltipContent()) this.close(); }

  @HostListener('keydown.tab', ['$event'])
  focusContent(event: Event): void {
    if (!(event as KeyboardEvent).shiftKey && this.dacaTooltipContent() && this.tooltip) {
      const first = this.tooltip.querySelector<HTMLElement>('a,button,[tabindex="0"]');
      if (first) { event.preventDefault(); first.focus(); }
    }
  }

  @HostListener('document:keydown.escape')
  escape(): void {
    if (this.tooltip?.contains(this.document.activeElement)) this.host.nativeElement.focus();
    this.close();
  }

  @HostListener('document:pointerdown', ['$event'])
  outside(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target) && !this.tooltip?.contains(target)) this.close();
  }

  @HostListener('window:resize')
  close(): void {
    this.cancelClose();
    this.tooltip?.remove();
    this.tooltip = null;
    this.contentView?.destroy();
    this.contentView = null;
    const host = this.host.nativeElement;
    const ids = (host.getAttribute('aria-describedby') ?? '').split(' ').filter(id => id && id !== this.id);
    if (ids.length) host.setAttribute('aria-describedby', ids.join(' '));
    else host.removeAttribute('aria-describedby');
    if (this.dacaTooltipContent()) { host.removeAttribute('aria-controls'); host.setAttribute('aria-expanded', 'false'); }
    this.document.removeEventListener('scroll', this.onScroll, true);
  }

  private scheduleClose(): void {
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.close(), 180);
  }

  private cancelClose(): void { if (this.closeTimer) clearTimeout(this.closeTimer); this.closeTimer = undefined; }

  ngOnDestroy(): void { this.close(); }
}

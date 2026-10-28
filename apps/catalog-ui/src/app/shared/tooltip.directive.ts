import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, HostListener, inject, input, OnDestroy } from '@angular/core';

let tooltipSequence = 0;

/** Reuses the catalog's glossary tooltip appearance for ordinary controls and canvas cards. */
@Directive({ selector: '[dacaTooltip]', standalone: true })
export class TooltipDirective implements OnDestroy {
  readonly dacaTooltip = input('');
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private tooltip: HTMLDivElement | null = null;
  private readonly id = `daca-tooltip-${++tooltipSequence}`;
  private readonly closeOnScroll = () => this.close();

  @HostListener('mouseenter')
  @HostListener('focusin')
  open(): void {
    this.close();
    const text = this.dacaTooltip().trim();
    if (!text) return;
    const tooltip = this.document.createElement('div');
    tooltip.id = this.id;
    tooltip.className = 'daca-glossary-tooltip is-visible';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '2400';
    tooltip.textContent = text;
    (this.document.fullscreenElement ?? this.document.body).append(tooltip);
    this.tooltip = tooltip;
    const host = this.host.nativeElement;
    host.setAttribute('aria-describedby', [host.getAttribute('aria-describedby'), this.id].filter(Boolean).join(' '));
    const rect = host.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
    const width = this.document.documentElement.clientWidth || this.document.defaultView!.innerWidth;
    const height = this.document.defaultView!.innerHeight;
    tooltip.style.left = `${Math.max(12, Math.min(rect.left, width - bounds.width - 12))}px`;
    tooltip.style.top = `${Math.max(12, rect.bottom + bounds.height + 20 < height ? rect.bottom + 8 : rect.top - bounds.height - 8)}px`;
    this.document.addEventListener('scroll', this.closeOnScroll, true);
  }

  @HostListener('mouseleave')
  @HostListener('focusout')
  @HostListener('pointerdown')
  @HostListener('document:keydown.escape')
  @HostListener('window:resize')
  close(): void {
    this.tooltip?.remove();
    this.tooltip = null;
    const host = this.host.nativeElement;
    const ids = (host.getAttribute('aria-describedby') ?? '').split(' ').filter(id => id && id !== this.id);
    if (ids.length) host.setAttribute('aria-describedby', ids.join(' '));
    else host.removeAttribute('aria-describedby');
    this.document.removeEventListener('scroll', this.closeOnScroll, true);
  }

  ngOnDestroy(): void { this.close(); }
}

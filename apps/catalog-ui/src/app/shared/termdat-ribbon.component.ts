import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GlossaryTermSummary } from '../core/catalog.models';
import { CatalogI18nService } from '../core/catalog-i18n.service';

/** A source ribbon requires an explicit match to an actual TERMDAT entry. */
export function termdatSourceUri(term: Pick<GlossaryTermSummary, 'relations'> | null): string | null {
  for (const relation of term?.relations ?? []) {
    if (relation.relationType !== 'exactMatch' || !relation.targetUri) continue;
    const uri = verifiedTermdatUri(relation.targetUri);
    if (uri) return uri;
  }
  return null;
}

function verifiedTermdatUri(value: string | null): string | null {
  if (!value) return null;
  try {
    const uri = new URL(value);
    if (uri.protocol !== 'https:' || uri.username || uri.password || uri.port) return null;
    if ((uri.hostname === 'www.termdat.bk.admin.ch' && /^\/(?:search\/)?entry\/\d+\/?$/.test(uri.pathname))
      || (uri.hostname === 'register.ld.admin.ch' && /^\/termdat\/\d+\/?$/.test(uri.pathname))) return uri.href;
  } catch { /* Missing or malformed provenance never produces a ribbon. */ }
  return null;
}

@Component({
  selector: 'daca-termdat-ribbon', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (source(); as uri) {<a class="termdat-ribbon" [href]="uri" target="_blank" rel="noopener noreferrer" [title]="description()" [attr.aria-label]="description()" (pointerdown)="$event.stopPropagation()" (click)="$event.stopPropagation()">TERMDAT</a>}`,
  styles: [`:host{display:inline-block;vertical-align:middle}.termdat-ribbon{display:inline-block;padding:3px 12px 5px 8px;background:#075078;color:#fff;font-size:10px;font-weight:800;line-height:1.2;letter-spacing:.04em;text-decoration:none;clip-path:polygon(0 0,100% 0,calc(100% - 5px) 50%,100% 100%,0 100%)}.termdat-ribbon:hover{background:#003b5c}.termdat-ribbon:focus-visible{clip-path:none;outline:3px solid #e1a700;outline-offset:2px}`],
})
export class TermdatRibbonComponent {
  readonly sourceUri = input<string | null>(null);
  readonly source = computed(() => verifiedTermdatUri(this.sourceUri()));
  private readonly i18n = inject(CatalogI18nService);
  readonly description = computed(() => ({
    de: 'Bezeichnung aus TERMDAT (Bundeskanzlei). Beschreibung redaktionell in DaCa. Quelle in neuem Tab öffnen.',
    fr: 'Désignation issue de TERMDAT (Chancellerie fédérale). Description rédigée dans DaCa. Ouvrir la source dans un nouvel onglet.',
    it: 'Denominazione da TERMDAT (Cancelleria federale). Descrizione redazionale in DaCa. Aprire la fonte in una nuova scheda.',
    en: 'Designation from TERMDAT (Federal Chancellery). Editorial description in DaCa. Open source in a new tab.',
    rm: 'Denominaziun da TERMDAT (Chanzlia federala). Descripziun redacziunala en DaCa. Avrir la funtauna en in nov tab.',
  })[this.i18n.language()]);
}

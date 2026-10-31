import { Injectable, inject } from '@angular/core';
import { UserPreferencesService } from './user-preferences.service';

import { CATALOG_COPY as COPY } from './catalog-copy';
import { CATALOG_RM } from './catalog-rm';

export type CatalogTranslationKey = keyof typeof COPY;

@Injectable({ providedIn: 'root' })
export class CatalogI18nService {
  private readonly preferences = inject(UserPreferencesService);
  readonly language = this.preferences.language.asReadonly();
  t(key: CatalogTranslationKey, values: Record<string, string | number> = {}): string {
    const language = this.preferences.language();
    const text = language === 'rm' ? CATALOG_RM[key] : COPY[key][({ de: 0, fr: 1, it: 2, en: 3 })[language]];
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
  }
}

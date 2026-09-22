import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { PocGuideActionTarget } from './poc-guide.models';

export interface PocGuideConfig {
  readonly daaifUiUrl: string | null;
  readonly environment: string;
}

const EMPTY_CONFIG: PocGuideConfig = { daaifUiUrl: null, environment: 'unknown' };

@Injectable({ providedIn: 'root' })
export class PocGuideConfigService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<PocGuideConfig>(EMPTY_CONFIG);
  readonly config = this.state.asReadonly();
  readonly loading = signal(true);

  constructor() {
    this.http.get<PocGuideConfig>('/api/v1/poc/guide-config').pipe(
      catchError(() => of(EMPTY_CONFIG)),
    ).subscribe((config) => {
      this.state.set(config);
      this.loading.set(false);
    });
  }

  externalHref(target: PocGuideActionTarget): string | null {
    const base = this.state().daaifUiUrl;
    if (!base || (target !== 'daaif-notebook' && target !== 'daaif-loader' && target !== 'daaif-source-explorer')) return null;
    const suffix = target === 'daaif-notebook'
      ? '/notebooks/data-analysts-journey-cantonal-business-tax'
      : target === 'daaif-loader'
        ? '/loader-workbench'
        : '/catalog/sources/bit-shared-pg/explorer';
    try {
      const url = new URL(base);
      url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`;
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return null;
    }
  }
}

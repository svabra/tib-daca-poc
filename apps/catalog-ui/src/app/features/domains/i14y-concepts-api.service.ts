import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, switchMap, throwError, timeout } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { I14yCodeListEntry, I14yConcept, I14yConceptCollection, I14ySyncStatus } from './i14y-concepts.models';

@Injectable({ providedIn: 'root' })
export class I14yConceptsApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);

  search(filters: {
    query?: string;
    language?: string;
    conceptType?: string;
    publisher?: string;
    status?: string;
    theme?: string;
  } = {}): Observable<I14yConceptCollection> {
    let params = new HttpParams();
    if (filters.query) params = params.set('q', filters.query);
    for (const key of ['conceptType', 'publisher', 'status', 'language', 'theme'] as const) {
      const value = filters[key]?.trim();
      if (value) params = params.set(key, value);
    }
    return this.safe(this.http.get<I14yConceptCollection | I14yConcept[]>('/api/v1/i14y/concepts', {
      headers: this.identity.headers(), params,
    })).pipe(map((value) => {
      const collection = Array.isArray(value) ? { items: value, total: value.length } : value;
      const language = filters.language as keyof I14yConcept['name'] | undefined;
      const theme = filters.theme?.trim().toLocaleLowerCase('de-CH');
      const items = collection.items.map((item) => this.normalizeConcept(item)).filter((item) =>
        (!language || Boolean(item.name[language] || item.description[language])) &&
        (!theme || item.themes.some((itemTheme) => itemTheme.toLocaleLowerCase('de-CH').includes(theme))),
      );
      return { items, total: items.length };
    }));
  }

  remoteSearch(query: string): Observable<I14yConceptCollection> {
    const params = new HttpParams().set('q', query.trim());
    return this.safe(this.http.get<I14yConceptCollection | I14yConcept[]>('/api/v1/i14y/concepts/remote-search', {
      headers: this.identity.headers(), params,
    })).pipe(map((value) => {
      const collection = Array.isArray(value) ? { items: value, total: value.length } : value;
      const items = collection.items.map((item) => this.normalizeConcept(item));
      return { items, total: items.length };
    }));
  }

  load(id: string): Observable<I14yConcept> {
    return this.safe(this.http.get<I14yConcept>(`/api/v1/i14y/concepts/${encodeURIComponent(id)}`, {
      headers: this.identity.headers(),
    })).pipe(map((value) => this.normalizeConcept(value)));
  }

  refreshDetail(id: string): Observable<I14yConcept> {
    return this.safe(this.http.post<I14yConcept>(`/api/v1/i14y/concepts/${encodeURIComponent(id)}/refresh`, null, {
      headers: this.identity.headers(),
    })).pipe(map((value) => this.normalizeConcept(value)));
  }

  syncCodeListEntries(id: string): Observable<readonly I14yCodeListEntry[]> {
    return this.safe(this.http.post<I14yCodeListEntry[]>(`/api/v1/i14y/concepts/${encodeURIComponent(id)}/code-list-entries/sync`, null, {
      headers: this.identity.headers(),
    }));
  }

  syncStatus(): Observable<I14ySyncStatus> {
    return this.safe(this.http.get<I14ySyncStatus>('/api/v1/i14y/sync-status', { headers: this.identity.headers() }))
      .pipe(map((value) => this.normalizeSyncStatus(value)));
  }

  refresh(): Observable<I14ySyncStatus> {
    return this.safe(this.http.post<unknown>('/api/v1/i14y/concepts/sync', null, { headers: this.identity.headers() }))
      .pipe(switchMap(() => this.syncStatus()));
  }

  private normalizeConcept(value: I14yConcept): I14yConcept {
    const raw = value as unknown as Record<string, unknown>;
    const multilingual = (candidate: unknown): I14yConcept['name'] => {
      const item = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
      return { de: String(item['de'] ?? ''), fr: String(item['fr'] ?? ''), it: String(item['it'] ?? ''), en: String(item['en'] ?? ''), rm: item['rm'] ? String(item['rm']) : null };
    };
    const publisher = raw['publisher'] && typeof raw['publisher'] === 'object' ? raw['publisher'] as Record<string, unknown> : null;
    const themes = Array.isArray(raw['themes']) ? raw['themes'].map((theme) => {
      if (typeof theme === 'string') return theme;
      const item = theme && typeof theme === 'object' ? theme as Record<string, unknown> : {};
      const label = multilingual(item['name']);
      return label.de || label.fr || String(item['code'] ?? item['identifier'] ?? '');
    }).filter(Boolean) : [];
    const codeList = raw['codeList'] && typeof raw['codeList'] === 'object' ? raw['codeList'] as Record<string, unknown> : null;
    return {
      ...value,
      name: multilingual(raw['name']), description: multilingual(raw['description']), themes,
      publisher: publisher ? { id: String(publisher['id'] ?? publisher['identifier'] ?? ''), name: multilingual(publisher['name']) } : null,
      version: String(raw['version'] ?? ''), publicationLevel: raw['publicationLevel'] ? String(raw['publicationLevel']) : null,
      registrationStatus: raw['registrationStatus'] ? String(raw['registrationStatus']) : null,
      codeList: codeList ? { entryCount: Number(codeList['entryCount'] ?? 0), entriesLoaded: Boolean(codeList['entriesLoaded']) } : null,
    };
  }

  private normalizeSyncStatus(value: I14ySyncStatus): I14ySyncStatus {
    const status = String((value as unknown as Record<string, unknown>)['status']);
    return { ...value, status: status === 'succeeded' ? 'success' : status === 'failed' ? 'error' : ['never', 'running', 'success', 'error'].includes(status) ? status as I14ySyncStatus['status'] : 'error' };
  }

  private safe<T>(request: Observable<T>): Observable<T> {
    const expectedIdentity = this.identity.userId();
    return request.pipe(
      timeout(8000),
      map((value) => {
        if (this.identity.userId() !== expectedIdentity) throw new Error('Die Identität wurde gewechselt; veraltete I14Y-Daten wurden verworfen.');
        return value;
      }),
      catchError(() => throwError(() => new Error('Der lokale I14Y-Concept-Cache ist derzeit nicht erreichbar.'))),
    );
  }
}

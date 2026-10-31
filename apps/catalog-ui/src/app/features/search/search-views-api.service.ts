import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { timeout } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { SearchKind, SearchMode } from './catalog-search.models';

export interface SearchViewConfiguration {
  schemaVersion: 1; query: string; mode: SearchMode; kind: SearchKind | 'all'; organization: string;
  domain: string; status: 'all' | 'active'; connection: 'all' | 'connected' | 'metadata'; sort: 'relevance' | 'name';
}
export interface SearchViewWrite { name: string; description: string; configuration: SearchViewConfiguration; }
export interface SearchView extends SearchViewWrite { id: string; ownerUserId: string; revision: number; createdAt: string; updatedAt: string; }
export interface SharedSearchView {
  id: string; senderUserId: string; senderName: string; sourceRevision: number; snapshot: SearchViewWrite;
  message: string; sentAt: string; acceptedAt: string | null; acceptedViewId: string | null; dismissedAt: string | null;
}
export const EMPTY_SEARCH_VIEW: SearchViewConfiguration = {schemaVersion: 1, query: '', mode: 'context', kind: 'all',
  organization: 'all', domain: 'all', status: 'all', connection: 'all', sort: 'relevance'};

export function sameViewConfiguration(a: SearchViewConfiguration, b: SearchViewConfiguration): boolean {
  return (Object.keys(EMPTY_SEARCH_VIEW) as (keyof SearchViewConfiguration)[]).every(key => a[key] === b[key]);
}

@Injectable({providedIn: 'root'})
export class SearchViewsApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  private headers(view?: SearchView) { return view ? this.identity.headers().set('If-Match', `"${view.revision}"`) : this.identity.headers(); }
  list() { return this.http.get<SearchView[]>('/api/v1/me/search-views', {headers: this.headers()}).pipe(timeout(8000)); }
  create(body: SearchViewWrite) { return this.http.post<SearchView>('/api/v1/me/search-views', body, {headers: this.headers()}).pipe(timeout(8000)); }
  update(view: SearchView, body: SearchViewWrite) { return this.http.put<SearchView>(`/api/v1/me/search-views/${view.id}`, body, {headers: this.headers(view)}).pipe(timeout(8000)); }
  delete(view: SearchView) { return this.http.delete<void>(`/api/v1/me/search-views/${view.id}`, {headers: this.headers(view)}).pipe(timeout(8000)); }
  share(view: SearchView, recipientUserIds: string[], message: string) {
    return this.http.post<{createdCount: number}>(`/api/v1/me/search-views/${view.id}/share`, {recipientUserIds, message}, {headers: this.headers(view)}).pipe(timeout(8000));
  }
  inbox() { return this.http.get<SharedSearchView[]>('/api/v1/me/search-view-shares', {headers: this.headers()}).pipe(timeout(8000)); }
  received(id: string) { return this.http.get<SharedSearchView>(`/api/v1/me/search-view-shares/${encodeURIComponent(id)}`, {headers: this.headers()}).pipe(timeout(8000)); }
  accept(share: SharedSearchView, name: string) {
    return this.http.post<SearchView>(`/api/v1/me/search-view-shares/${share.id}/accept`, {name}, {headers: this.headers()}).pipe(timeout(8000));
  }
  dismiss(share: SharedSearchView) { return this.http.post<void>(`/api/v1/me/search-view-shares/${share.id}/dismiss`, {}, {headers: this.headers()}).pipe(timeout(8000)); }
}

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { DemoIdentityService } from './demo-identity.service';
import { CatalogLanguage } from './user-preferences.service';

export type ResponsibilityRole = 'data_owner' | 'deputy_data_owner' | 'data_steward';
export type ResponsibilityCategory = 'domain' | 'logical_model' | 'physical_representation' | 'data_product';

export interface CatalogResponsibility {
  userId: string;
  role: ResponsibilityRole;
  basis: string;
}

export interface CatalogResponsibilityObject {
  id: string;
  category: ResponsibilityCategory;
  name: string;
  description: string;
  href: string;
  domainIds: string[];
  responsibilities: CatalogResponsibility[];
}

export interface CatalogResponsibilityPerson {
  id: string;
  name: string;
  organization: string;
  avatarUrl: string | null;
  roles: Array<{ role: ResponsibilityRole; organizationId: string; organizationName: string }>;
}

export interface CatalogResponsibilityIndex {
  people: CatalogResponsibilityPerson[];
  objects: CatalogResponsibilityObject[];
  domains: Array<{ id: string; name: string }>;
}

export interface RoleChangeEvent {
  sequence: number;
  occurredAt: string;
  actorUserId: string;
  actorName: string;
  action: 'baseline' | 'assigned' | 'changed' | 'removed';
  scopeType: string;
  scopeId: string;
  entityId: string;
  scopeName: string;
  role: ResponsibilityRole;
  subjectUserId: string;
  subjectName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface RoleChangePage {
  items: RoleChangeEvent[];
  nextBefore: number | null;
}

export interface DocumentationGlossaryTerm {
  id: string;
  abbreviation: string | null;
  term: string;
  shortDescription: string;
  detailedDescription: string;
  isTermdat: boolean;
  language: string;
  availableLanguages: string[];
}

@Injectable({ providedIn: 'root' })
export class DocumentationApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  private readonly termCache = new Map<string, Observable<DocumentationGlossaryTerm>>();

  responsibilities(language: CatalogLanguage): Observable<CatalogResponsibilityIndex> {
    return this.http.get<CatalogResponsibilityIndex>('/api/v1/documentation/responsibilities', {
      headers: this.identity.headers(), params: { lang: language },
    });
  }

  roleChanges(language: CatalogLanguage, before?: number): Observable<RoleChangePage> {
    return this.http.get<RoleChangePage>('/api/v1/documentation/role-changes', {
      headers: this.identity.headers(),
      params: before == null ? { lang: language } : { lang: language, before },
    });
  }

  glossary(language: CatalogLanguage, query = ''): Observable<DocumentationGlossaryTerm[]> {
    return this.http.get<DocumentationGlossaryTerm[]>('/api/v1/documentation/glossary', {
      headers: this.identity.headers(), params: { lang: language, q: query },
    });
  }

  glossaryTerm(id: string, language: CatalogLanguage): Observable<DocumentationGlossaryTerm> {
    return this.http.get<DocumentationGlossaryTerm>(`/api/v1/documentation/glossary/${encodeURIComponent(id)}`, {
      headers: this.identity.headers(), params: { lang: language },
    });
  }

  lookupTerm(term: string, language: CatalogLanguage): Observable<DocumentationGlossaryTerm> {
    const key = `${this.identity.userId()}:${language}:${term.toLocaleLowerCase()}`;
    let request = this.termCache.get(key);
    if (!request) {
      request = this.http.get<DocumentationGlossaryTerm>('/api/v1/documentation/glossary/lookup', {
        headers: this.identity.headers(), params: { term, lang: language },
      }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.termCache.set(key, request);
    }
    return request;
  }
}

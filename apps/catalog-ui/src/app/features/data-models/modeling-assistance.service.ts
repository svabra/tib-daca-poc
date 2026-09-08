import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DemoIdentityService, ModelingPersona, ModelingRole } from '../../core/demo-identity.service';
import { DataClassification } from './data-models.models';

export interface FederalOrganization {
  id: string; parentId: string | null; departmentCode: string; officeCode: string | null;
  displayName: string; organizationType: 'federal_council' | 'chancellery' | 'department' | 'office' | 'affiliated';
  sourceId: string | null; sourceUri: string | null; breadcrumb: { id: string; label: string }[];
}
export interface BusinessObjectTerm {
  id: string; urn: string; versionId: string; revision: number;
  labels: { language: string; preferredLabel: string; definition: string }[]; domainIds: string[];
}
export interface ModelingScope {
  role: ModelingRole; organizationId: string; delegatedOwnerUserId: string | null;
  breadcrumb: { id: string; label: string }[];
}
export interface TermdatEntry {
  entryId: string; uri: string; preferredTerm: string; definition: string; descriptionType: 'definition'|'note'|'context'|'none';
  languages: Record<string, { term: string; definition: string; descriptionType: 'definition'|'note'|'context'|'none'; source: string }>;
  status: string | null; reliability: string | null; collection: string | null;
  classification: string | null; subjects: string[]; source: string; payloadHash: string;
  sourceModifiedAt: string | null; retrievedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ModelingAssistanceService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  private headers(): HttpHeaders { return typeof this.identity.headers === 'function' ? this.identity.headers() : new HttpHeaders(); }
  organizations(parentId: string): Observable<FederalOrganization[]> {
    return this.http.get<FederalOrganization[]>('/api/v1/identity-directory/organizations', { headers: this.headers(), params: new HttpParams().set('parentId', parentId).set('language', 'de') });
  }
  myScopes(): Observable<ModelingScope[]> {
    return this.http.get<ModelingScope[]>('/api/v1/modeling/scopes/mine', { headers: this.headers() });
  }
  personas(role: ModelingRole, preferredOfficeId: string, delegatedOwnerUserId?: string): Observable<ModelingPersona[]> {
    let params = new HttpParams().set('role', role).set('preferredOfficeId', preferredOfficeId);
    if (delegatedOwnerUserId) params = params.set('delegatedOwnerUserId', delegatedOwnerUserId);
    return this.http.get<ModelingPersona[]>('/api/v1/modeling/personas', { headers: this.headers(), params });
  }
  businessObjects(domainId?: string): Observable<{ items: BusinessObjectTerm[]; total: number }> {
    let params = new HttpParams().set('conceptKind', 'business_object');
    if (domainId) params = params.set('domainId', domainId);
    return this.http.get<{ items: BusinessObjectTerm[]; total: number }>('/api/v1/terminology/terms', { headers: this.headers(), params });
  }
  translate(sourceText: string, classification: DataClassification): Observable<{ sourceTextHash: string; translations: Record<string, string>; retrievedAt: string; payloadHash: string }> {
    return this.http.post<{ sourceTextHash: string; translations: Record<string, string>; retrievedAt: string; payloadHash: string }>('/api/v1/assistance/translations', { sourceText, sourceLanguage: 'DE', targetLanguages: ['FR', 'IT', 'EN'], classification }, { headers: this.headers() });
  }
  searchTermdat(query: string): Observable<{ items: TermdatEntry[]; total: number }> {
    return this.http.get<{ items: TermdatEntry[]; total: number }>('/api/v1/termdat/search', { headers: this.headers(), params: new HttpParams().set('q', query).set('language', 'de').set('limit', 10) });
  }
}

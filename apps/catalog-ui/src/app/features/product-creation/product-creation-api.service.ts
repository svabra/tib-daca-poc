import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import type { BasisWindowType, CreationFormat, CreationFrequency, RollingWindowUnit } from './creation-request-fields';

export interface CreationRequest {
  id: string; requestNumber: string; revision: number; requesterUserId: string; requesterName: string;
  ownerUserId: string; ownerName: string; sourceProductIds: string[]; sourceTitles: string[];
  proposedTitle: string; purpose: string; taxYear: number | null; cantonCode: string | null; formats: string[];
  basisFrom?: string | null; basisUntil?: string | null; legalBasis?: string | null; updateFrequency?: CreationFrequency | null;
  basisWindowType?: BasisWindowType; rollingWindowSize?: number | null; rollingWindowUnit?: RollingWindowUnit | null;
  status: 'submitted' | 'in_progress' | 'fulfilled' | 'rejected'; decisionComment: string | null;
  resultProductId: string | null; daaifNotebookUrl: string | null; createdAt: string; updatedAt: string;
}
export interface CreationProduct {
  id: string; title: string; ownerUserId: string | null; lifecycle: string;
  metadata: { sourceProductId?: string };
}

@Injectable({ providedIn: 'root' })
export class ProductCreationApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  private readonly base = '/api/v1/product-creation-requests';
  list() { return firstValueFrom(this.http.get<CreationRequest[]>(this.base, { headers: this.identity.headers() })); }
  read(id: string) { return firstValueFrom(this.http.get<CreationRequest>(`${this.base}/${encodeURIComponent(id)}`, { headers: this.identity.headers() })); }
  create(body: { sourceProductIds: string[]; proposedTitle: string; purpose: string; basisWindowType:BasisWindowType; basisFrom?:string; basisUntil?:string; rollingWindowSize?:number; rollingWindowUnit?:RollingWindowUnit; legalBasis:string; updateFrequency:CreationFrequency; formats:CreationFormat[] }) {
    return firstValueFrom(this.http.post<CreationRequest>(this.base, body, { headers: this.identity.headers() }));
  }
  decide(row: CreationRequest, decision: 'accept' | 'reject', comment: string) {
    return firstValueFrom(this.http.post<CreationRequest>(`${this.base}/${row.id}/decision`, { decision, comment }, { headers: this.identity.headers().set('If-Match', `"${row.revision}"`) }));
  }
  fulfill(row: CreationRequest, resultProductId: string) {
    return firstValueFrom(this.http.post<CreationRequest>(`${this.base}/${row.id}/fulfillment`, { resultProductId }, { headers: this.identity.headers().set('If-Match', `"${row.revision}"`) }));
  }
  async products(): Promise<CreationProduct[]> {
    const headers = this.identity.headers();
    const products: CreationProduct[] = [];
    let cursor = '';
    do {
      const page = await firstValueFrom(this.http.get<{ items: CreationProduct[]; nextCursor: string | null }>('/api/v1/data-products', { headers, params: { limit: '100', ...(cursor ? { cursor } : {}) } }));
      products.push(...page.items); cursor = page.nextCursor || '';
    } while (cursor);
    return products;
  }
}

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';

export type CommentVisibility = 'public' | 'private';
export interface ProductComment {
  id: string; text: string; visibility: CommentVisibility; createdAt: string;
  authorUserId: string; authorName: string; authorOrganization: string;
}
export interface ProductCommentPage {
  items: ProductComment[]; canViewPrivate: boolean; nextOffset: number | null;
}

@Injectable({ providedIn: 'root' })
export class ProductCommentsApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);
  list(productId: string, offset = 0): Promise<ProductCommentPage> {
    return firstValueFrom(this.http.get<ProductCommentPage>(this.url(productId), {
      headers: this.identity.headers(), params: { offset, limit: 50 },
    }));
  }
  create(productId: string, text: string, visibility: CommentVisibility) {
    return firstValueFrom(this.http.post<{id: string; visibility: CommentVisibility; createdAt: string}>(
      this.url(productId), { text, visibility }, { headers: this.identity.headers() },
    ));
  }
  deletePublic(productId: string, commentId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url(productId)}/${encodeURIComponent(commentId)}`, {
      headers: this.identity.headers(),
    }));
  }
  private url(productId: string): string {
    return `/api/v1/data-products/${encodeURIComponent(productId)}/comments`;
  }
}

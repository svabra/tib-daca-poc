import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError, timeout } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import {
  ServiceLevelControlPersonUpdateResponse,
  ServiceLevelHttpResult,
  ServiceLevelRevision,
  ServiceLevelRevisionListResponse,
  ServiceLevelRevisionWrite,
  ServiceLevelSummaryResponse,
} from './product-service-level.models';

export type ServiceLevelApiErrorKind =
  | 'conflict'
  | 'precondition'
  | 'permission'
  | 'state'
  | 'validation'
  | 'unavailable'
  | 'not_found'
  | 'unknown';

export class ServiceLevelApiError extends Error {
  constructor(
    readonly kind: ServiceLevelApiErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceLevelApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class ProductServiceLevelApiService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(DemoIdentityService);

  loadSummary(productId: string): Observable<ServiceLevelSummaryResponse> {
    return this.identitySafe(
      this.http.get<ServiceLevelSummaryResponse>(this.baseUrl(productId), {
        headers: this.identity.headers(),
      }),
    );
  }

  loadRevisions(productId: string): Observable<ServiceLevelRevisionListResponse> {
    return this.identitySafe(
      this.http.get<ServiceLevelRevisionListResponse>(`${this.baseUrl(productId)}/revisions`, {
        headers: this.identity.headers(),
      }),
    );
  }

  loadRevision(productId: string, revisionId: string): Observable<ServiceLevelHttpResult<ServiceLevelRevision>> {
    return this.identitySafeResponse(
      this.http.get<ServiceLevelRevision>(
        `${this.baseUrl(productId)}/revisions/${encodeURIComponent(revisionId)}`,
        { headers: this.identity.headers(), observe: 'response' },
      ),
    );
  }

  createRevision(
    productId: string,
    value: ServiceLevelRevisionWrite,
    collectionEtag: string,
  ): Observable<ServiceLevelHttpResult<ServiceLevelRevision>> {
    return this.identitySafeResponse(
      this.http.post<ServiceLevelRevision>(`${this.baseUrl(productId)}/revisions`, value, {
        headers: this.writeHeaders(collectionEtag),
        observe: 'response',
      }),
    );
  }

  updateRevision(
    productId: string,
    revisionId: string,
    value: ServiceLevelRevisionWrite,
    lockVersion: number,
  ): Observable<ServiceLevelHttpResult<ServiceLevelRevision>> {
    return this.identitySafeResponse(
      this.http.put<ServiceLevelRevision>(
        `${this.baseUrl(productId)}/revisions/${encodeURIComponent(revisionId)}`,
        value,
        { headers: this.writeHeaders(`"${lockVersion}"`), observe: 'response' },
      ),
    );
  }

  submitRevision(
    productId: string,
    revisionId: string,
    lockVersion: number,
  ): Observable<ServiceLevelHttpResult<ServiceLevelRevision>> {
    return this.revisionAction(productId, revisionId, 'submit', null, lockVersion);
  }

  withdrawRevision(
    productId: string,
    revisionId: string,
    lockVersion: number,
  ): Observable<ServiceLevelHttpResult<ServiceLevelRevision>> {
    return this.revisionAction(productId, revisionId, 'withdraw', null, lockVersion);
  }

  decideRevision(
    productId: string,
    revisionId: string,
    lockVersion: number,
    decision: 'approve' | 'reject',
    reason?: string,
  ): Observable<ServiceLevelHttpResult<ServiceLevelRevision>> {
    return this.revisionAction(
      productId,
      revisionId,
      'decision',
      { decision, ...(reason ? { reason } : {}) },
      lockVersion,
    );
  }

  updateControlPerson(
    productId: string,
    controlPersonUserId: string,
    productRevision: number,
  ): Observable<ServiceLevelControlPersonUpdateResponse> {
    return this.identitySafe(
      this.http.put<ServiceLevelControlPersonUpdateResponse>(
        `/api/v1/data-products/${encodeURIComponent(productId)}/control-person`,
        { controlPersonUserId },
        { headers: this.writeHeaders(`"${productRevision}"`) },
      ),
    );
  }

  private revisionAction(
    productId: string,
    revisionId: string,
    action: 'submit' | 'withdraw' | 'decision',
    body: Record<string, unknown> | null,
    lockVersion: number,
  ): Observable<ServiceLevelHttpResult<ServiceLevelRevision>> {
    return this.identitySafeResponse(
      this.http.post<ServiceLevelRevision>(
        `${this.baseUrl(productId)}/revisions/${encodeURIComponent(revisionId)}/${action}`,
        body,
        { headers: this.writeHeaders(`"${lockVersion}"`), observe: 'response' },
      ),
    );
  }

  private identitySafe<T>(request: Observable<T>): Observable<T> {
    const requestedIdentity = this.identity.userId();
    return request.pipe(
      timeout(5000),
      map((body) => {
        this.assertIdentity(requestedIdentity);
        return body;
      }),
      catchError((error: unknown) => throwError(() => this.presentError(error))),
    );
  }

  private identitySafeResponse<T>(request: Observable<HttpResponse<T>>): Observable<ServiceLevelHttpResult<T>> {
    const requestedIdentity = this.identity.userId();
    return request.pipe(
      timeout(5000),
      map((response) => {
        this.assertIdentity(requestedIdentity);
        if (!response.body) throw new ServiceLevelApiError('unknown', 502, 'Die Katalog-API hat keine SLA-Daten geliefert.');
        return {
          body: response.body,
          etag: response.headers.get('etag') ?? '',
        };
      }),
      catchError((error: unknown) => throwError(() => this.presentError(error))),
    );
  }

  private assertIdentity(expected: string): void {
    if (this.identity.userId() !== expected) {
      throw new ServiceLevelApiError(
        'permission',
        403,
        'Die Demo-Identität hat während der Anfrage gewechselt. Veraltete SLA-Daten wurden verworfen.',
      );
    }
  }

  private writeHeaders(etag: string): HttpHeaders {
    return this.identity.headers().set('If-Match', etag);
  }

  private baseUrl(productId: string): string {
    return `/api/v1/data-products/${encodeURIComponent(productId)}/service-level`;
  }

  private presentError(error: unknown): ServiceLevelApiError {
    if (error instanceof ServiceLevelApiError) return error;
    if (!(error instanceof HttpErrorResponse)) {
      return new ServiceLevelApiError('unavailable', 0, 'Die SLA-Daten sind derzeit nicht erreichbar. Es wurde nichts gespeichert.');
    }
    if (error.status === 404) return new ServiceLevelApiError('not_found', 404, 'Das Datenprodukt oder die SLA-Revision ist nicht mehr verfügbar.');
    if (error.status === 401 || error.status === 403) return new ServiceLevelApiError('permission', error.status, 'Für diese SLA-Aktion fehlt die erforderliche Rolle oder Zuweisung.');
    if (error.status === 409) return new ServiceLevelApiError('state', 409, 'Die SLA befindet sich nicht mehr im erwarteten Bearbeitungszustand. Bitte neu laden.');
    if (error.status === 412) return new ServiceLevelApiError('conflict', 412, 'Die SLA wurde zwischenzeitlich geändert. Ihre Eingaben wurden nicht gespeichert.');
    if (error.status === 428) return new ServiceLevelApiError('precondition', 428, 'Die aktuelle SLA-Version fehlt. Bitte neu laden und erneut versuchen.');
    if (error.status === 422) return new ServiceLevelApiError('validation', 422, 'Die SLA-Angaben sind unvollständig oder widersprüchlich. Bitte prüfen Sie die markierten Felder.');
    if (error.status === 0 || error.status === 503 || error.status === 504) return new ServiceLevelApiError('unavailable', error.status, 'Die Katalog-API ist derzeit nicht erreichbar. Es wurde nichts gespeichert.');
    return new ServiceLevelApiError('unknown', error.status, 'Die SLA-Aktion ist fehlgeschlagen. Es wurde nichts gespeichert.');
  }
}

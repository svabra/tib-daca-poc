import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { CatalogApiService } from '../../core/catalog-api.service';
import { ProductEffectiveAccessGrant, ProductEffectiveAccessResponse } from '../../core/catalog.models';

/** One product page's actor-scoped view of the published policy. Never inferred from requests. */
@Injectable()
export class ProductPersonalAccessService {
  private readonly api = inject(CatalogApiService);
  readonly status = signal<ProductEffectiveAccessResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly ready = computed(() => !this.loading() && !this.error() && this.status() !== null);
  readonly granted = computed(() => this.ready() && this.status()!.granted);
  private generation = 0;
  private productId = '';

  constructor() { inject(DestroyRef).onDestroy(() => { ++this.generation; }); }

  load(productId: string): void {
    const generation = ++this.generation;
    const actor = this.api.identityUserId();
    this.productId = productId;
    this.status.set(null); this.loading.set(true); this.error.set(false);
    this.api.loadEffectiveAccess(productId).subscribe({
      next: status => {
        if (generation !== this.generation || actor !== this.api.identityUserId()) return;
        this.loading.set(false);
        if (!isConsistentPersonalAccess(status)) { this.error.set(true); return; }
        this.status.set(status);
      },
      error: () => {
        if (generation !== this.generation || actor !== this.api.identityUserId()) return;
        this.loading.set(false); this.error.set(true);
      },
    });
  }

  retry(): void { this.load(this.productId); }
}

export function isConsistentPersonalAccess(status: ProductEffectiveAccessResponse): boolean {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  return Boolean(status && typeof status.granted === 'boolean' && isoDate.test(status.asOfDate)
    && Array.isArray(status.grants) && status.granted === (status.grants.length > 0)
    && (status.policyRevision === null || (Number.isInteger(status.policyRevision) && status.policyRevision! > 0))
    && (!status.granted || (Number.isInteger(status.policyRevision) && status.policyRevision! > 0))
    && status.grants.every(grant => grant && typeof grant.grantId === 'string' && Boolean(grant.grantId.trim())
      && typeof grant.subjectDisplayName === 'string' && Boolean(grant.subjectDisplayName.trim())
      && (grant.subjectType === 'person' || (grant.subjectType === 'group' && Boolean(grant.groupId?.trim())))
      && Array.isArray(grant.protocols) && grant.protocols.length > 0
      && grant.protocols.every(protocol => protocol === 'http' || protocol === 'postgresql')
      && (grant.dataVariant === 'original' || grant.dataVariant === 'modified')
      && isoDate.test(grant.validFrom) && isoDate.test(grant.validUntil)
      && grant.validFrom <= status.asOfDate && status.asOfDate <= grant.validUntil));
}

export function grantAvailabilityLabel(grant: ProductEffectiveAccessGrant): string {
  const window = grant.weeklyAvailability;
  if (!window) return 'Durchgehend · 24/7';
  const days = {monday:'Mo',tuesday:'Di',wednesday:'Mi',thursday:'Do',friday:'Fr',saturday:'Sa',sunday:'So'};
  return `${window.weekdays.map(day => days[day]).join(', ')}, ${window.startTime}–${window.endTime} ${window.timeZone}`;
}

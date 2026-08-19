import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '@bit-daca/design-system';
import { finalize } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DataProduct, ProductActivityItem } from '../../core/catalog.models';
import { ProductWorkspaceNavComponent } from '../../shared/product-workspace-nav.component';
import { presentProductActivity } from '../activity/product-activity.presenter';
import { recentProductActivity } from './metadata-activity-preview';

@Component({
  selector: 'daca-metadata-studio',
  standalone: true,
  imports: [DatePipe, ProductWorkspaceNavComponent, ReactiveFormsModule, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <daca-product-workspace-nav
      [productId]="product().id"
      [productTitle]="product().title"
      activeSection="metadata"
    />

    <section class="daca-page-heading metadata-heading">
      <div>
        <p class="daca-eyebrow">Datenprodukt · Metadaten</p>
        <h1>Metadaten</h1>
        <p>Bearbeiten Sie den DCAT-AP-CH-kompatiblen Katalogeintrag. Änderungen erzeugen eine neue Revision und einen Audit-Eintrag.</p>
      </div>
      <div class="metadata-revision">
        <daca-status-badge tone="green">{{ product().lifecycle }}</daca-status-badge>
        <span>Revision <strong>{{ product().revision }}</strong></span>
      </div>
    </section>

    @if (api.usingFallback()) {
      <p class="daca-alert is-warning">Preview mode: the editor is populated, but saving requires the catalog API.</p>
    }
    @if (message()) {
      <p class="daca-alert" [class.is-error]="messageTone() === 'error'" role="status">{{ message() }}</p>
    }

    <div class="metadata-layout">
      <form class="daca-card metadata-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="daca-card-header">
          <div><p class="daca-eyebrow">Descriptive metadata</p><h2>Product identity</h2></div>
          <span class="metadata-required">* Required fields</span>
        </div>
        <div class="daca-card-body metadata-form-grid">
          <label class="metadata-field metadata-field-wide">Title *
            <input formControlName="title" autocomplete="off">
            @if (form.controls.title.touched && form.controls.title.invalid) { <small>Enter a product title.</small> }
          </label>
          <label class="metadata-field">Owner *<input formControlName="owner" autocomplete="organization"></label>
          <label class="metadata-field">Domain *<input formControlName="domain" autocomplete="off"></label>
          <label class="metadata-field metadata-field-wide">Description *
            <textarea rows="5" formControlName="description"></textarea>
            <span class="metadata-counter">{{ form.controls.description.value.length }} characters</span>
          </label>
          <label class="metadata-field">Lifecycle
            <select formControlName="lifecycle"><option value="draft">Draft</option><option value="active">Active</option><option value="deprecated">Deprecated</option><option value="retired">Retired</option></select>
          </label>
          <label class="metadata-field">Classification
            <select formControlName="classification"><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select>
          </label>
          <label class="metadata-field">Contact *<input type="email" formControlName="contact" autocomplete="email"></label>
          <label class="metadata-field">Update frequency<input formControlName="updateFrequency" autocomplete="off"></label>
          <label class="metadata-field metadata-field-wide">Keywords <span>(comma-separated)</span><input formControlName="keywords" autocomplete="off"></label>
          <label class="metadata-field">License<input formControlName="license" autocomplete="off"></label>
          <label class="metadata-field">Quality statement<input formControlName="quality" autocomplete="off"></label>
        </div>
        <div class="metadata-form-actions">
          <span>@if (form.dirty) { Unsaved changes } @else { All fields reflect revision {{ product().revision }} }</span>
          <button class="daca-button" type="submit" [disabled]="form.invalid || saving() || !productReady()">
            {{ saving() ? 'Saving…' : 'Save new revision' }}
          </button>
        </div>
      </form>

      <aside class="metadata-sidebar">
        <section class="daca-card">
          <div class="daca-card-header"><h2>Catalog identity</h2><daca-status-badge tone="blue">DCAT profile</daca-status-badge></div>
          <div class="daca-card-body">
            <dl class="metadata-definition-list">
              <div><dt>Global ID</dt><dd class="daca-code">{{ product().globalId }}</dd></div>
              <div><dt>Origin</dt><dd>{{ product().originCatalog }}</dd></div>
              <div><dt>Last changed</dt><dd>{{ product().updatedAt | date: 'medium' }}</dd></div>
            </dl>
          </div>
        </section>

        <section class="daca-card">
          <div class="daca-card-header"><h2>Distribution endpoints</h2><span>{{ product().endpoints.length }}</span></div>
          <div class="daca-card-body metadata-endpoints">
            @for (endpoint of product().endpoints; track endpoint.id) {
              <article class="metadata-endpoint">
                <span class="metadata-protocol">{{ endpoint.protocol === 'http-rest' ? 'REST' : 'PG' }}</span>
                <div>
                  <strong>{{ endpoint.title }}</strong>
                  @if (endpoint.protocol === 'http-rest') {
                    <code>{{ endpoint.method }} {{ endpoint.url }}</code>
                  } @else {
                    <code>{{ endpoint.host }}:{{ endpoint.port }}/{{ endpoint.database }} · {{ endpoint.schema }}.{{ endpoint.relation }}</code>
                  }
                  <small>Credentials: secret reference only</small>
                </div>
              </article>
            }
          </div>
        </section>

        <section class="daca-card" aria-labelledby="metadata-activity-title">
          <div class="daca-card-header metadata-activity-header">
            <h2 id="metadata-activity-title">Letzte Änderungen</h2>
            <a [routerLink]="['/products', routeProductId, 'history']">Vollständigen Verlauf öffnen</a>
          </div>
          <div class="daca-card-body metadata-audit" aria-live="polite">
            @if (activityLoading()) {
              <p class="metadata-activity-state" role="status">Aktivitäten werden geladen …</p>
            } @else if (activityError()) {
              <div class="metadata-activity-state is-error" role="alert">
                <p>Die letzten Änderungen konnten nicht geladen werden. Der Metadateneditor bleibt verfügbar.</p>
                <button class="daca-button is-secondary" type="button" (click)="loadRecentActivity()">Erneut versuchen</button>
              </div>
            } @else if (recentActivity().length === 0) {
              <p class="metadata-activity-state">Noch keine protokollierten Änderungen.</p>
            } @else {
              <ol class="metadata-activity-list">
                @for (item of recentActivity(); track item.key) {
                  <li>
                    <span aria-hidden="true"></span>
                    <strong>{{ presentActivity(item).title }}</strong>
                    <small>
                      {{ item.actor.displayName }} ·
                      <time [attr.datetime]="item.occurredAt">{{ item.occurredAt | date: 'dd.MM.yyyy, HH:mm' }}</time>
                    </small>
                  </li>
                }
              </ol>
            }
          </div>
        </section>
      </aside>
    </div>
  `,
})
export class MetadataStudioComponent {
  readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  readonly routeProductId = this.route.snapshot.paramMap.get('id') ?? this.api.product().id;
  readonly product = signal<DataProduct>({
    ...this.api.product(),
    id: this.routeProductId,
    title: 'Datenprodukt wird geladen',
    revision: 0,
    endpoints: [],
  });
  readonly productReady = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly messageTone = signal<'info' | 'error'>('info');
  readonly recentActivity = signal<readonly ProductActivityItem[]>([]);
  readonly activityLoading = signal(true);
  readonly activityError = signal(false);
  readonly presentActivity = presentProductActivity;
  private appliedRevision = 0;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(4000)]],
    owner: ['', Validators.required],
    domain: ['', Validators.required],
    lifecycle: ['active' as DataProduct['lifecycle']],
    classification: ['restricted' as DataProduct['classification']],
    keywords: [''],
    contact: ['', [Validators.required, Validators.email]],
    license: [''],
    quality: [''],
    updateFrequency: [''],
  });

  constructor() {
    this.api.loadProduct(this.routeProductId).subscribe({
      next: (product) => {
        if (product.id !== this.routeProductId) {
          this.messageTone.set('error');
          this.message.set('Das geladene Datenprodukt stimmt nicht mit der angeforderten Metadatenseite überein.');
          return;
        }
        this.product.set(product);
        this.productReady.set(true);
      },
      error: () => {
        this.messageTone.set('error');
        this.message.set('Die Produktmetadaten konnten nicht geladen werden. Es werden keine Ersatzdaten angezeigt.');
      },
    });
    this.loadRecentActivity();
    effect(() => {
      const product = this.product();
      if (product.revision === this.appliedRevision || this.form.dirty) return;
      this.appliedRevision = product.revision;
      this.form.reset({
        title: product.title,
        description: product.description,
        owner: product.owner,
        domain: product.domain,
        lifecycle: product.lifecycle,
        classification: product.classification,
        keywords: product.keywords.join(', '),
        contact: product.contact,
        license: product.license,
        quality: product.quality,
        updateFrequency: product.updateFrequency,
      });
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || !this.productReady()) return;
    const value = this.form.getRawValue();
    const current = this.product();
    this.saving.set(true);
    this.message.set('');
    this.api
      .updateProductMetadata(current, {
        ...value,
        keywords: value.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.product.set(updated);
          this.appliedRevision = updated.revision;
          this.form.markAsPristine();
          this.messageTone.set('info');
          this.message.set(`Revision ${updated.revision} saved and added to the audit trail.`);
          this.loadRecentActivity();
        },
        error: (error: Error) => {
          this.messageTone.set('error');
          this.message.set(error.message);
        },
      });
  }

  loadRecentActivity(): void {
    this.activityLoading.set(true);
    this.activityError.set(false);
    this.api.loadProductActivity(this.routeProductId)
      .pipe(finalize(() => this.activityLoading.set(false)))
      .subscribe({
        next: (response) => this.recentActivity.set(recentProductActivity(response.items)),
        error: () => {
          this.recentActivity.set([]);
          this.activityError.set(true);
        },
      });
  }
}

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { SourceAccessRequest } from '../../core/catalog.models';
import { SourceAccessRequestsComponent } from './source-access-requests.component';

const request: SourceAccessRequest = {
  id: 'request-1', requestNumber: 'DS-2026-BAZG01', clientRequestId: 'client-1',
  source: {
    id: 'ora_bazg_zoll', sourceType: 'oracle', databaseName: 'BZGZOLL1', displayName: 'BAZG Zentrale Zollabwicklung',
    description: 'Synthetic Oracle customs source', organization: 'BAZG', ownerUserId: 'sandro.wenger', ownerName: 'Sandro Wenger',
    sites: ['PRIMUS', 'CAMPUS'], objects: [{ schema: 'ZOLL', name: 'ANMELDUNGEN', kind: 'table' }], mockProfile: {}, accessStatus: 'submitted',
  },
  requesterId: 'joel.ruod', requesterName: 'Joel Ruod', requesterOrganization: 'ESTV', ownerUserId: 'sandro.wenger', ownerName: 'Sandro Wenger',
  requestTitle: 'Oracle customs analytics', subject: { type: 'group', id: 'estv-business-intelligence', label: 'ESTV Business Intelligence', memberCount: 2, membershipRevision: 1, recommended: true },
  groupSnapshot: { groupId: 'estv-business-intelligence', label: 'ESTV Business Intelligence', membershipRevision: 1, memberIds: ['joel.ruod', 'kassandra.valdata'] },
  purpose: 'Analyse synthetic customs data.', legalBasis: 'PoC mandate', validFrom: '2026-08-20', validUntil: null, conditionsAccepted: true,
  status: 'submitted', decisionBy: null, decisionComment: null, decidedAt: null, createdAt: '2026-08-20T08:00:00Z', updatedAt: '2026-08-20T08:00:00Z',
};

describe('SourceAccessRequestsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the immutable group evidence and sends a direct owner approval', async () => {
    const api = {
      sourceAccessRequests: signal([request]), sourceAccessRequestsLoading: signal(false), sourceAccessRequestsError: signal<string | null>(null),
      refreshSourceAccessRequestInbox: vi.fn(), decideSourceAccessRequest: vi.fn(() => of({ ...request, status: 'approved' })),
    };
    await TestBed.configureTestingModule({ imports: [SourceAccessRequestsComponent], providers: [{ provide: CatalogApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(SourceAccessRequestsComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('BAZG Zentrale Zollabwicklung');
    expect(root.textContent).toContain('ESTV Business Intelligence');
    expect(root.textContent).toContain('Revision 1');
    expect(root.textContent).toContain('Unbefristet');
    root.querySelector<HTMLButtonElement>('.source-access-owner-actions .daca-button')!.click();
    expect(api.decideSourceAccessRequest).toHaveBeenCalledWith('request-1', 'approve', expect.any(String));
  });
});

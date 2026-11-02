import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { LineageEdge, LineageNode } from '../../core/catalog.models';
import { LINEAGE_CARD, layoutLineage, LineageExplorerComponent } from './lineage-explorer.component';

vi.mock('@bit-daca/design-system', async () => {
  const { Component } = await import('@angular/core');
  class StatusBadgeStub {}
  Component({selector: 'daca-status-badge', standalone: true, template: '<ng-content />', inputs: ['tone']})(StatusBadgeStub);
  return {StatusBadgeComponent: StatusBadgeStub};
});

const nodes: LineageNode[] = [
  { id: 'urn:test:source', label: 'Source with a very long readable title', detail: '', kind: 'source', catalog: 'ESTV' },
  { id: 'urn:test:transform', label: 'Transformation', detail: 'Aggregation', kind: 'transform', catalog: 'ESTV' },
  { id: 'urn:test:product', urn: 'urn:test:product', productId: FALLBACK_PRODUCT.id, label: 'Steuerstatistik mit langem Titel nach Kanton und Jahr', detail: 'Kurzbeschreibung', kind: 'product', catalog: 'ESTV' },
  { id: 'urn:test:consumer', label: 'Finance Dashboard', detail: '', kind: 'consumer', catalog: 'St. Gallen' },
];
const edges: LineageEdge[] = [
  { id: 'a', source: nodes[0].id, target: nodes[1].id, label: 'transformed-by', state: 'verified' },
  { id: 'b', source: nodes[1].id, target: nodes[2].id, label: 'derived-from', state: 'verified' },
  { id: 'c', source: nodes[2].id, target: nodes[3].id, label: 'consumed-by', state: 'declared' },
];

describe('Lineage explorer', () => {
  afterEach(() => TestBed.resetTestingModule());
  function render(asset?: string, canViewAccessLogs=false) {
    TestBed.configureTestingModule({providers: [provideRouter([]),
      {provide: ActivatedRoute, useValue: {snapshot: {paramMap: convertToParamMap({id: FALLBACK_PRODUCT.id})}, queryParamMap: of(convertToParamMap(asset ? {asset} : {}))}},
      {provide: CatalogApiService, useValue: {product: signal({...FALLBACK_PRODUCT, title: nodes[2].label, description: nodes[2].detail, owner: 'Data Owner Test'}), selectProduct: vi.fn(), identityUsers: () => [], identityUserId:()=> 'owner', loadLineage: () => of({nodes, edges:edges.map(edge=>({...edge,canViewAccessLogs})), provenance: []})}},
    ]});
    const fixture = TestBed.createComponent(LineageExplorerComponent); fixture.detectChanges();
    return {fixture, root: fixture.nativeElement as HTMLElement};
  }

  it('reserves space for cards and relation labels and preserves source-to-target flow', () => {
    const layout = layoutLineage(nodes, edges);
    for (const edge of layout.edges) {
      const source = layout.nodes.find(node => node.id === edge.source)!, target = layout.nodes.find(node => node.id === edge.target)!;
      expect(source.x).toBeLessThan(target.x);
      expect(edge.path).toMatch(/^M /);
      for (const node of layout.nodes) {
        const overlaps = Math.abs(node.x - edge.labelX) < (LINEAGE_CARD.width + edge.labelWidth) / 2
          && Math.abs(node.y - edge.labelY) < (LINEAGE_CARD.height + 28) / 2;
        expect(overlaps).toBe(false);
      }
    }
    const parallel = layoutLineage(nodes, [...edges, {...edges[0], id: 'parallel'}]);
    expect(parallel.edges).toHaveLength(4);
    expect(parallel.edges[0].path).not.toBe(parallel.edges[3].path);
    expect(layoutLineage(nodes, [{...edges[0], target: 'missing'}]).edges).toEqual([]);
  });

  it('shows a keyboard-accessible summary with the exact URN and a native new-tab product link', () => {
    const {root} = render();
    const node = root.querySelector<HTMLButtonElement>('[data-kind="product"]')!;
    expect(node.querySelector('.lineage-node-owner')?.textContent).toBe('Data Owner Test');
    expect(node.getAttribute('aria-label')).toContain('Data Owner: Data Owner Test');
    node.focus();
    const summary = document.querySelector<HTMLElement>('.daca-glossary-tooltip[role="dialog"]')!;
    expect(summary.textContent).toContain('Data Owner Test');
    expect(summary.textContent).toContain('Kurzbeschreibung');
    expect(summary.querySelector('code')?.textContent).toBe('urn:test:product');
    const link = summary.querySelector<HTMLAnchorElement>('a')!;
    expect(link.getAttribute('href')).toBe(`/products/${FALLBACK_PRODUCT.id}/overview`);
    expect(link.target).toBe('_blank'); expect(link.rel).toBe('noopener');
    node.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
    expect(document.activeElement).toBe(link);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(document.querySelector('.daca-glossary-tooltip')).toBeNull();
    expect(document.activeElement).toBe(node);
  });

  it('uses the domain-network card hierarchy and shared tailed highways without retyping reference roles', () => {
    const {fixture,root} = render();
    const component=fixture.componentInstance;
    expect(root.querySelectorAll('.lineage-node.daca-canvas-object .canvas-object-type')).toHaveLength(nodes.length);
    expect(root.querySelector('[data-kind="product"]')?.getAttribute('data-canvas-kind')).toBe('product');
    expect(component.canvasKind(nodes[0])).toBe('source');
    expect(component.canvasKind({...nodes[0],productId:'known-product'})).toBe('product');
    for(const [urn,type] of [['logical-model','logical'],['physical-snapshot','physical'],['organization','organization'],['terminology','term'],['domain','domain']]) {
      expect(component.canvasKind({...nodes[0],urn:`urn:daca:${urn}:example`})).toBe(type);
    }
    expect(component.canvasKind({...nodes[0],urn:'urn:daca:physical-source:connection'})).toBe('source');
    expect(root.querySelectorAll('.daca-highway-band')).toHaveLength(edges.length);
    expect(root.querySelectorAll('.daca-highway-packet .daca-highway-tail')).toHaveLength(edges.length);
    expect(root.querySelector('marker')).toBeNull();
    for(const packet of root.querySelectorAll<SVGElement>('.daca-highway-packet')) {
      expect(packet.style.getPropertyValue('--flow-duration')).toBe('3s');
      expect(packet.style.getPropertyValue('--flow-path')).toContain('path("M ');
    }
    for(const edge of component.graph().edges) {
      expect(edge.ribbonPath).toMatch(new RegExp(`^M ${edge.from.x} ${edge.from.y}`));
      expect(edge.ribbonPath).not.toBe(edge.path);
      expect(edge.flightPath).not.toBe(edge.path);
      const endpoints=edge.flightPath.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(Math.abs(endpoints[0]-edge.from.x)).toBeLessThan(LINEAGE_CARD.width/2);
      expect(Math.abs(endpoints[1]-edge.from.y)).toBeLessThan(LINEAGE_CARD.height/2);
      expect(Math.abs(endpoints[endpoints.length-2]-edge.to.x)).toBeLessThan(LINEAGE_CARD.width/2);
      expect(Math.abs(endpoints[endpoints.length-1]-edge.to.y)).toBeLessThan(LINEAGE_CARD.height/2);
    }
    expect(component.edgeHelp(edges[0])).toContain('kein Live-Datenverkehr');
  });

  it('selects a referenced consumer from its deep link without inventing metadata', () => {
    const {fixture, root} = render('urn:test:consumer');
    expect(fixture.componentInstance.selectedNode()?.kind).toBe('consumer');
    const node = root.querySelector<HTMLButtonElement>('[data-kind="consumer"]')!;
    expect(node.classList.contains('is-consumer')).toBe(true);
    node.dispatchEvent(new MouseEvent('mouseenter'));
    const summary = document.querySelector('.daca-glossary-tooltip')!;
    expect(summary.textContent).toContain('Nicht erfasst');
    expect(summary.querySelector('p')).toBeNull();
    expect(summary.querySelector('a')?.getAttribute('href')).toBe(`/products/${FALLBACK_PRODUCT.id}/lineage?asset=urn:test:consumer`);
  });

  it('opens an owner-only new-tab access log link from the edge and supports keyboard dismissal', async () => {
    const {fixture,root}=render(undefined,true);
    const edge=root.querySelector<SVGElement>('[data-edge-id="c"]')!;
    edge.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}));
    fixture.detectChanges();await fixture.whenStable();
    const link=root.querySelector<HTMLAnchorElement>('.lineage-edge-menu a')!;
    expect(link.getAttribute('href')).toBe(`/products/${FALLBACK_PRODUCT.id}/lineage/c/access-events`);
    expect(link.target).toBe('');expect(link.rel).toBe('noopener');
    expect(document.activeElement).toBe(link);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.detectChanges();
    expect(root.querySelector('.lineage-edge-menu')).toBeNull();
  });

  it('keeps the access option visible but disabled without the server capability', () => {
    const {fixture,root}=render();
    root.querySelector<SVGElement>('[data-edge-id="c"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));
    fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('.lineage-edge-menu button')!.disabled).toBe(true);
    expect(root.querySelector('.lineage-edge-menu a')).toBeNull();
    expect(root.querySelector('.lineage-edge-menu small')!.textContent).toContain('Data Owner');
  });
});

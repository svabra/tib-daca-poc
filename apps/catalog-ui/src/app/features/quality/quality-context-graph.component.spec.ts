import { TestBed } from '@angular/core/testing';
import { QualityContextGraphComponent } from './quality-context-graph.component';

describe('QualityContextGraphComponent', () => {
  it('renders five metadata nodes and four directed, labelled edges', async () => {
    await TestBed.configureTestingModule({
      imports: [QualityContextGraphComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(QualityContextGraphComponent);
    fixture.componentRef.setInput('sourceLabel', 'DAAIF');
    fixture.componentRef.setInput('productTitle', 'Kantonale Gewerbesteuer 2022–2026');
    fixture.componentRef.setInput('ownerLabel', 'Eidgenössische Steuerverwaltung ESTV');
    fixture.componentRef.setInput('domainLabel', 'Unternehmens-/Gewerbesteuer');
    fixture.componentRef.setInput('serviceLabel', 'REST Data Service');
    fixture.componentRef.setInput('serviceDetail', 'kantonale-gewerbesteuer-api');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const nodes = root.querySelectorAll('[data-graph-node]');
    const edges = root.querySelectorAll('[data-graph-edge]');
    const relationList = root.querySelector('.quality-context-graph-relations');

    expect(nodes.length).toBe(5);
    expect(edges.length).toBe(4);
    expect(Array.from(nodes).map((node) => node.getAttribute('data-graph-node'))).toEqual(['source', 'product', 'owner', 'domain', 'service']);
    expect(Array.from(edges).map((edge) => edge.getAttribute('data-graph-edge'))).toEqual(['source-product', 'product-owner', 'product-domain', 'product-service']);
    expect(Array.from(edges).every((edge) => Boolean(edge.getAttribute('d')))).toBe(true);
    expect(Array.from(edges).every((edge) => edge.getAttribute('marker-end') === 'url(#quality-context-arrow)')).toBe(true);
    expect(root.querySelector('.quality-context-graph-edges marker')).not.toBeNull();
    expect(root.textContent).toContain('publiziert');
    expect(root.textContent).toContain('verantwortet durch');
    expect(root.textContent).toContain('fachlicher Kontext');
    expect(root.textContent).toContain('bereitgestellt über');
    expect(root.textContent).toContain('kantonale-gewerbesteuer-api');
    expect(relationList?.textContent).toContain('Kantonale Gewerbesteuer 2022–2026');
    expect(relationList?.getAttribute('aria-label')).toBe('Beziehungen im Kontextgraph');
  });
});

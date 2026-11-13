import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogApiService } from '../../core/catalog-api.service';
import { CatalogI18nService } from '../../core/catalog-i18n.service';
import { LandingPreferencesService } from '../../core/landing-preferences.service';
import { FALLBACK_PRODUCT } from '../../core/catalog.seed';
import { OrganizationCanvasComponent } from './organization-canvas.component';
import { RecentWorkComponent } from './recent-work.component';
import { WelcomePageComponent } from './welcome-page.component';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');
  class Badge {} Component({selector:'daca-status-badge',standalone:true,template:'<ng-content />',inputs:['tone']})(Badge);
  class Glossary {} Component({selector:'daca-glossary-term',standalone:true,template:'',inputs:['term']})(Glossary);
  return {StatusBadgeComponent:Badge,DacaGlossaryTermComponent:Glossary};
});

@Component({selector:'daca-organization-canvas',standalone:true,template:'Datenraum'})
class CanvasStub {}
@Component({selector:'daca-recent-work',standalone:true,template:'Letzte Arbeiten'})
class RecentStub {}

describe('Welcome search placement',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('moves one live search with the welcome preference, keeps its query/results and preserves the data-room instance',async()=>{
    const visible=signal(true);
    const product={...FALLBACK_PRODUCT,title:'MWST-Erträge Schweiz'};
    const api={product:signal(product),products:signal([product]),identityUser:()=>({displayName:'Jan Waser'}),
      ownerAccessRequests:signal([]),ownerAccessRequestLoading:signal(false),ownerAccessRequestError:signal(null),
      workflowTasks:signal([]),workflowTasksLoading:signal(false),workflowTasksError:signal(null)};
    TestBed.configureTestingModule({imports:[WelcomePageComponent],providers:[provideRouter([]),
      {provide:CatalogApiService,useValue:api},{provide:CatalogI18nService,useValue:{t:(key:string)=>key}},
      {provide:LandingPreferencesService,useValue:{welcomeVisible:visible,storageError:signal(false),setWelcome:(value:boolean)=>visible.set(value)}},
    ]}).overrideComponent(WelcomePageComponent,{remove:{imports:[OrganizationCanvasComponent,RecentWorkComponent]},add:{imports:[CanvasStub,RecentStub]}});
    const fixture=TestBed.createComponent(WelcomePageComponent);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const canvas=root.querySelector('daca-organization-canvas');
    expect(root.querySelectorAll('[role="search"]')).toHaveLength(1);
    expect(root.querySelector('.welcome-hero [role="search"]')).not.toBeNull();
    expect(root.querySelector('.welcome-sidebar')).toBeNull();
    expect(root.querySelector('.welcome-workspace.is-full-width')).not.toBeNull();
    const input=root.querySelector<HTMLInputElement>('#catalog-search')!;
    input.value='mwst';input.dispatchEvent(new Event('input'));fixture.detectChanges();
    expect(root.querySelector('.welcome-search-results')?.textContent).toContain('MWST-Erträge Schweiz');
    visible.set(false);fixture.detectChanges();
    expect(root.querySelector('.welcome-hero')).toBeNull();
    expect(root.querySelector('.welcome-sidebar [role="search"]')).not.toBeNull();
    expect(root.querySelector('.welcome-workspace.is-full-width')).toBeNull();
    expect(root.querySelector<HTMLInputElement>('#catalog-search')?.value).toBe('mwst');
    expect(root.querySelector('.welcome-search-results')?.textContent).toContain('MWST-Erträge Schweiz');
    expect(root.querySelector('daca-organization-canvas')).toBe(canvas);
    visible.set(true);fixture.detectChanges();
    expect(root.querySelector('.welcome-hero [role="search"]')).not.toBeNull();
    expect(root.querySelector('.welcome-sidebar')).toBeNull();
    expect(root.querySelectorAll('#catalog-search')).toHaveLength(1);
    expect(root.querySelectorAll('#catalog-search-feedback')).toHaveLength(1);
    expect(root.querySelector<HTMLInputElement>('#catalog-search')?.value).toBe('mwst');
    expect(root.querySelector('daca-organization-canvas')).toBe(canvas);
  });
});

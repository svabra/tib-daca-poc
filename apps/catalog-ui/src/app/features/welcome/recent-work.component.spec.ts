import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { RecentWork, RecentWorkComponent } from './recent-work.component';

describe('RecentWorkComponent',()=>{
  const actor=signal('kassandra.valdata'),language=signal<'de'|'fr'>('de');
  beforeEach(()=>{
    actor.set('kassandra.valdata');language.set('de');
    TestBed.configureTestingModule({imports:[RecentWorkComponent],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      {provide:DemoIdentityService,useValue:{userId:actor,headers:computed(()=>new HttpHeaders({'X-DaCa-User':actor()}))}},
      {provide:UserPreferencesService,useValue:{language}},
    ]});
  });
  afterEach(()=>{TestBed.inject(HttpTestingController).verify();TestBed.resetTestingModule();});
  function render(){const fixture=TestBed.createComponent(RecentWorkComponent);fixture.detectChanges();return{fixture,root:fixture.nativeElement as HTMLElement,http:TestBed.inject(HttpTestingController)};}
  const data:RecentWork={categories:[{id:'products',items:Array.from({length:5},(_,i)=>({id:String(i),kind:'product',title:{de:`Produkt ${i}`,fr:`Produit ${i}`},editedAt:'2026-10-31T10:00:00Z',route:`/products/${i}/overview`,queryParams:{}}))},{id:'models',items:[]},{id:'domains',items:[]},{id:'terms',items:[{id:'term',kind:'term',title:{de:'Mein Begriff'},editedAt:'2026-10-30T10:00:00Z',route:'/domains/terminology',queryParams:{termId:'term',ownOffice:'0',view:'cards'}}]}]};
  it('keeps three items per nonempty category with exact links and changes display language without another read',()=>{
    const {fixture,root,http}=render();
    expect(root.querySelector('[role=status]')).not.toBeNull();
    const request=http.expectOne('/api/v1/me/recent-work');expect(request.request.headers.get('X-DaCa-User')).toBe(actor());request.flush(data);fixture.detectChanges();
    expect(root.querySelectorAll('.recent-category')).toHaveLength(2);
    expect(root.querySelectorAll('[data-category=products] li')).toHaveLength(3);
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/products/0/overview');
    expect(root.querySelector('[data-category=terms] a')?.getAttribute('href')).toContain('termId=term');
    expect(root.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-31T10:00:00Z');
    language.set('fr');fixture.detectChanges();expect(root.textContent).toContain('Mes derniers travaux');expect(root.textContent).toContain('Produit 0');
    http.expectNone('/api/v1/me/recent-work');
  });
  it('clears old identities immediately, cancels pending work, and supports independent retry and empty state',()=>{
    const {fixture,root,http}=render();const pending=http.expectOne('/api/v1/me/recent-work');
    actor.set('fausto.marzo');fixture.detectChanges();expect(pending.cancelled).toBe(true);expect(root.querySelector('a')).toBeNull();
    const current=http.expectOne('/api/v1/me/recent-work');expect(current.request.headers.get('X-DaCa-User')).toBe('fausto.marzo');
    current.flush('offline',{status:503,statusText:'Unavailable'});fixture.detectChanges();expect(root.textContent).toContain('konnten nicht geladen werden');
    root.querySelector('button')!.click();fixture.detectChanges();http.expectOne('/api/v1/me/recent-work').flush({categories:[]});fixture.detectChanges();
    expect(root.textContent).toContain('Noch keine gespeicherten Bearbeitungen');expect(root.querySelector('.recent-category')).toBeNull();
  });
});

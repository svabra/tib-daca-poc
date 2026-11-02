import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DacaNotificationMenuComponent } from '../../../../packages/design-system/src/lib/notification-menu.component';
import { catalogNotifications } from './core/catalog-notifications';
import type { WorkflowTaskWire } from './core/catalog-api.service';
import type { StoredAccessRequest } from './core/catalog.models';

describe('Header notification messages',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('keeps the bell visible when empty and closes the DAAIF-style panel with Escape and outside clicks',()=>{
    TestBed.configureTestingModule({imports:[DacaNotificationMenuComponent],providers:[provideRouter([])]});
    const fixture=TestBed.createComponent(DacaNotificationMenuComponent);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,menu=root.querySelector('details')!,summary=root.querySelector('summary')!;
    expect(summary.getAttribute('aria-label')).toBe('Benachrichtigungen: 0');
    expect(root.querySelector('.notification-badge')).toBeNull();
    expect(root.textContent).toContain('Keine offenen Nachrichten.');
    menu.open=true;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(menu.open).toBe(false);
    menu.open=true;document.body.click();expect(menu.open).toBe(false);
  });
  it('shows individual messages and a count, closes on identity change and distinguishes an unavailable status',()=>{
    TestBed.configureTestingModule({imports:[DacaNotificationMenuComponent],providers:[provideRouter([])]});
    const fixture=TestBed.createComponent(DacaNotificationMenuComponent);
    fixture.componentRef.setInput('context','owner');
    fixture.componentRef.setInput('items',[{id:'request:r',title:'Zugriffsanfrage von Fausto',detail:'Aggregierte Statistik',createdAt:'2026-11-02T10:00:00Z',route:'/tasks',queryParams:{request:'r',product:'p'}}]);
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,menu=root.querySelector('details')!;
    expect(root.querySelector('.notification-badge')?.textContent?.trim()).toBe('1');
    expect(root.querySelector('.notification-item')?.getAttribute('href')).toBe('/tasks?request=r&product=p');
    menu.open=true;fixture.componentRef.setInput('context','another-user');fixture.detectChanges();expect(menu.open).toBe(false);
    fixture.componentRef.setInput('items',[]);fixture.componentRef.setInput('error',true);fixture.detectChanges();
    expect(root.textContent).not.toContain('Keine offenen Nachrichten.');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Nachrichtenstatus derzeit unbekannt');
    expect(root.querySelector('.notification-badge')?.textContent?.trim()).toBe('!');
  });
  it('deduplicates request tasks and inbox entries and retains requests without a task',()=>{
    const request={id:'r',requesterName:'Fausto',requestNumber:'ZA-1',purpose:'Testanfrage',dataProductId:'p',status:'submitted',createdAt:'2026-11-02T10:00:00Z'} as StoredAccessRequest;
    const task={id:'t',taskType:'access_request_review',accessRequestId:'r',dataProductId:'p',status:'open',title:'Zugriffsanfrage von Fausto',detail:'Antrag prüfen',createdAt:request.createdAt} as WorkflowTaskWire;
    const messages=catalogNotifications([task],[request]);
    expect(messages).toHaveLength(1);expect(messages[0].queryParams).toEqual({request:'r',product:'p'});
    expect(catalogNotifications([],[request])).toHaveLength(1);
    expect(catalogNotifications([{...task,status:'completed'}],[{...request,status:'rejected'}])).toEqual([]);
    expect(catalogNotifications([],[])).toEqual([]);
  });
  it('opens requester decision messages at the exact personal request instead of owner approval',()=>{
    for(const taskType of ['access_request_approved','access_request_granted','access_request_rejected'] as const){
      const task={id:taskType,taskType,accessRequestId:'mine',dataProductId:'product',status:'open',title:'Entscheid',detail:'ZA-1',createdAt:'2026-11-02T10:00:00Z'} as WorkflowTaskWire;
      expect(catalogNotifications([task],[])).toEqual([expect.objectContaining({route:'/products/product/usage',queryParams:{request:'mine'}})]);
      expect(catalogNotifications([{...task,status:'completed'}],[])).toEqual([]);
    }
  });
});

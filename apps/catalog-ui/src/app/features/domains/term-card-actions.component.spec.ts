import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { GlossaryTermSummary } from '../../core/catalog.models';
import { TermCardActionsComponent } from './term-card-actions.component';

describe('term card menu',()=>{
  beforeEach(()=>TestBed.configureTestingModule({imports:[TermCardActionsComponent],providers:[provideRouter([]),{provide:DemoIdentityService,useValue:{userId:signal('editor')}},{provide:UserPreferencesService,useValue:{language:signal('de')}}]}));
  afterEach(()=>TestBed.resetTestingModule());
  it('groups the existing actions, skips disabled TERMDAT during keyboard navigation and restores focus',async()=>{
    const fixture=TestBed.createComponent(TermCardActionsComponent);fixture.componentRef.setInput('term',{id:'t',preferredLabel:'Gebäude',status:'active'} as GlossaryTermSummary);fixture.detectChanges();await fixture.whenStable();
    const root=fixture.nativeElement as HTMLElement,trigger=root.querySelector('button')!;
    expect(root.querySelectorAll('button')).toHaveLength(1);
    trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));fixture.detectChanges();await fixture.whenStable();
    const items=[...root.querySelectorAll<HTMLElement>('[role=menuitem]')];expect(items).toHaveLength(3);expect(items[0].getAttribute('href')).toBe('/glossary/proposals/new?termId=t');
    expect((items[2] as HTMLButtonElement).disabled).toBe(true);expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));expect(document.activeElement).toBe(items[1]);
    const action=vi.fn();fixture.componentInstance.action.subscribe(action);items[1].click();fixture.detectChanges();expect(action).toHaveBeenCalledWith('request-retirement');expect(document.activeElement).toBe(trigger);
    trigger.click();fixture.detectChanges();await fixture.whenStable();root.querySelector('[role=menu]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));fixture.detectChanges();expect(root.querySelector('[role=menu]')).toBeNull();
  });
});

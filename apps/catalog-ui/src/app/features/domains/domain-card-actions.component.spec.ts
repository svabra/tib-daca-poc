import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DomainSummary } from '../../core/catalog.models';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { UserPreferencesService } from '../../core/user-preferences.service';
import { DomainCardActionsComponent } from './domain-card-actions.component';

describe('domain card menu',()=>{
  const userId=signal('owner');
  beforeEach(()=>TestBed.configureTestingModule({imports:[DomainCardActionsComponent],providers:[provideRouter([]),{provide:DemoIdentityService,useValue:{userId}},{provide:UserPreferencesService,useValue:{language:signal('de')}}]}));
  afterEach(()=>TestBed.resetTestingModule());
  async function render(canRequest=true,canGovern=true,status='active'){
    const fixture=TestBed.createComponent(DomainCardActionsComponent);
    fixture.componentRef.setInput('domain',{id:'domain',preferredLabel:'Personal',status} as DomainSummary);
    fixture.componentRef.setInput('canRequest',canRequest);fixture.componentRef.setInput('canGovern',canGovern);
    fixture.detectChanges();await fixture.whenStable();return fixture;
  }
  it('supports arrow navigation, Escape focus restoration and closing outside',async()=>{
    const fixture=await render(),root=fixture.nativeElement as HTMLElement;
    const trigger=root.querySelector('button')!;
    trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
    fixture.detectChanges();await fixture.whenStable();
    const menu=root.querySelector<HTMLElement>('[role=menu]')!,items=[...menu.querySelectorAll<HTMLElement>('[role=menuitem]')];
    expect(items).toHaveLength(5);expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(items[4]);
    items[4].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    fixture.detectChanges();expect(root.querySelector('[role=menu]')).toBeNull();expect(document.activeElement).toBe(trigger);
    trigger.click();fixture.detectChanges();await fixture.whenStable();document.body.click();fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
  it('retains only permitted actions and keeps retired cards openable',async()=>{
    const fixture=await render(false,false),root=fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('button')!.click();fixture.detectChanges();await fixture.whenStable();
    expect(root.querySelectorAll('[role=menuitem]')).toHaveLength(1);
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/domains/domain');
    fixture.componentRef.setInput('canRequest',true);fixture.componentRef.setInput('canGovern',true);
    fixture.componentRef.setInput('domain',{id:'domain',preferredLabel:'Personal',status:'retired'} as DomainSummary);
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('button')!.click();fixture.detectChanges();await fixture.whenStable();
    expect(root.querySelectorAll('[role=menuitem]')).toHaveLength(1);
  });
});

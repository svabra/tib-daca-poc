import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModelsOverviewComponent } from './logical-models-overview.component';
import { FALLBACK_LOGICAL_MODEL } from './mapping-fallback';

vi.mock('@bit-daca/design-system',async()=>{
  const {Component}=await import('@angular/core');class StatusBadgeStub{}
  Component({selector:'daca-status-badge',standalone:true,template:'<ng-content />',inputs:['tone']})(StatusBadgeStub);
  return{StatusBadgeComponent:StatusBadgeStub};
});

describe('LogicalModelsOverviewComponent',()=>{
  afterEach(()=>TestBed.resetTestingModule());

  it('links a model quality error to its mapping workspace',()=>{
    const model={...FALLBACK_LOGICAL_MODEL,mappingInconsistencyCount:2};
    const user=signal({id:'cinthya.thor',displayName:'Cinthya Thor',organization:'Verteidigung',department:'VBS',office:'vbs-verteidigung',roles:['data_steward'],primaryModelingRole:'data_steward'});
    TestBed.configureTestingModule({imports:[LogicalModelsOverviewComponent],providers:[
      provideRouter([]),
      {provide:DemoIdentityService,useValue:{userId:signal('cinthya.thor'),user,canEditModels:signal(true)}},
      {provide:DataModelsApiService,useValue:{listLogicalModels:()=>of([model])}},
    ]});
    const fixture=TestBed.createComponent(LogicalModelsOverviewComponent);fixture.detectChanges();TestBed.tick();fixture.detectChanges();
    const link=(fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.mapping-quality-error a');
    expect(link?.textContent).toContain('Inkonsistenzfehler (2)');
    expect(link?.getAttribute('href')).toBe(`/models/${model.id}/mappings`);
  });

  it('offers an explicit owner selector and filters by stable owner id',()=>{
    const other={...FALLBACK_LOGICAL_MODEL,id:'model-lawrence',title:{...FALLBACK_LOGICAL_MODEL.title,de:'Fahrzeugbestand'},dataOwner:{id:'lawrence.hill',displayName:'Lawrence Hill'}};
    const user=signal({id:'cinthya.thor',displayName:'Cinthya Thor',organization:'Verteidigung',department:'VBS',office:'vbs-verteidigung',roles:['data_steward'],primaryModelingRole:'data_steward'});
    TestBed.configureTestingModule({imports:[LogicalModelsOverviewComponent],providers:[
      provideRouter([]),
      {provide:DemoIdentityService,useValue:{userId:signal('cinthya.thor'),user,canEditModels:signal(true)}},
      {provide:DataModelsApiService,useValue:{listLogicalModels:()=>of([FALLBACK_LOGICAL_MODEL,other])}},
    ]});
    const fixture=TestBed.createComponent(LogicalModelsOverviewComponent);fixture.detectChanges();TestBed.tick();fixture.detectChanges();
    const component=fixture.componentInstance;const root=fixture.nativeElement as HTMLElement;
    const ownerSelect=root.querySelector<HTMLSelectElement>('select[aria-label="Data Owner"]')!;

    expect([...ownerSelect.options].map((option)=>option.textContent?.trim())).toEqual(['Alle','Christian Spider','Lawrence Hill']);
    component.owner.set('lawrence.hill');fixture.detectChanges();
    expect(component.filteredModels().map((model)=>model.id)).toEqual(['model-lawrence']);
    expect(root.querySelectorAll('.model-row')).toHaveLength(1);
    expect(root.textContent).toContain('Fahrzeugbestand');
    component.resetFilters();
    expect(component.owner()).toBe('');
  });

  it('shows the change timestamp with both date and time',()=>{
    const user=signal({id:'cinthya.thor',displayName:'Cinthya Thor',organization:'Verteidigung',department:'VBS',office:'vbs-verteidigung',roles:['data_steward'],primaryModelingRole:'data_steward'});
    TestBed.configureTestingModule({imports:[LogicalModelsOverviewComponent],providers:[
      provideRouter([]),
      {provide:DemoIdentityService,useValue:{userId:signal('cinthya.thor'),user,canEditModels:signal(true)}},
      {provide:DataModelsApiService,useValue:{listLogicalModels:()=>of([FALLBACK_LOGICAL_MODEL])}},
    ]});
    const fixture=TestBed.createComponent(LogicalModelsOverviewComponent);fixture.detectChanges();TestBed.tick();fixture.detectChanges();

    expect(fixture.componentInstance.dateLabel('2026-09-05T09:10:00Z')).toMatch(/05\.09\.2026,\s\d{2}:\d{2}/);
  });

  it('opens the two-card chooser and restores focus when the native dialog closes',()=>{
    const user=signal({id:'cinthya.thor',displayName:'Cinthya Thor',organization:'Verteidigung',department:'VBS',office:'vbs-verteidigung',roles:['data_steward'],primaryModelingRole:'data_steward'});
    TestBed.configureTestingModule({imports:[LogicalModelsOverviewComponent],providers:[
      provideRouter([]),
      {provide:DemoIdentityService,useValue:{userId:signal('cinthya.thor'),user,canEditModels:signal(true)}},
      {provide:DataModelsApiService,useValue:{listLogicalModels:()=>of([])}},
    ]});
    const fixture=TestBed.createComponent(LogicalModelsOverviewComponent);fixture.detectChanges();TestBed.tick();fixture.detectChanges();
    const component=fixture.componentInstance;const root=fixture.nativeElement as HTMLElement;
    const trigger=root.querySelector<HTMLButtonElement>('.models-actions button')!;
    const dialog=root.querySelector<HTMLDialogElement>('dialog')!;
    const showModal=vi.fn(()=>dialog.setAttribute('open',''));
    Object.defineProperty(dialog,'showModal',{configurable:true,value:showModal});
    const focus=vi.spyOn(trigger,'focus');

    trigger.click();fixture.detectChanges();
    expect(showModal).toHaveBeenCalledOnce();
    expect(root.querySelectorAll('.creation-card')).toHaveLength(2);
    expect(root.textContent).toContain('Rein logisches Modell');
    expect(root.textContent).toContain('Aus bestehender Datenquelle ableiten');
    dialog.dispatchEvent(new Event('close'));
    expect(focus).toHaveBeenCalledOnce();
  });

  it('disables model creation when the current actor lacks permission',()=>{
    const user=signal({id:'reader',displayName:'Reader',organization:'Verteidigung',department:'VBS',office:'vbs-verteidigung',roles:['data_consumer'],primaryModelingRole:'data_consumer'});
    TestBed.configureTestingModule({imports:[LogicalModelsOverviewComponent],providers:[
      provideRouter([]),
      {provide:DemoIdentityService,useValue:{userId:signal('reader'),user,canEditModels:signal(false)}},
      {provide:DataModelsApiService,useValue:{listLogicalModels:()=>of([])}},
    ]});
    const fixture=TestBed.createComponent(LogicalModelsOverviewComponent);fixture.detectChanges();TestBed.tick();fixture.detectChanges();
    const trigger=(fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.models-actions button')!;
    const dialog=(fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog')!;
    const showModal=vi.fn();Object.defineProperty(dialog,'showModal',{configurable:true,value:showModal});
    expect(trigger.disabled).toBe(true);
    fixture.componentInstance.openCreationChoice();
    expect(showModal).not.toHaveBeenCalled();
  });
});

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

describe('LogicalModelsOverviewComponent owner filter',()=>{
  afterEach(()=>TestBed.resetTestingModule());

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
});

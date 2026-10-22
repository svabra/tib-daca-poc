import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DomainSummary } from '../../core/catalog.models';
import { ModelDomainDialogComponent } from './model-domain-dialog.component';
import { FALLBACK_PHYSICAL_SNAPSHOT } from './mapping-fallback';

describe('model domain assignment dialog',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('preselects all writable representations, supports opting out and does not save on cancel',()=>{
    const active={id:'domain-1',preferredLabel:'Personal',status:'active'} as DomainSummary;
    TestBed.configureTestingModule({imports:[ModelDomainDialogComponent],providers:[{provide:CatalogApiService,useValue:{loadDomains:()=>of([active,{...active,id:'retired',status:'retired'}])}}]});
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
    const fixture=TestBed.createComponent(ModelDomainDialogComponent),component=fixture.componentInstance;
    const options=FALLBACK_PHYSICAL_SNAPSHOT.tables.map((table)=>({snapshot:FALLBACK_PHYSICAL_SNAPSHOT,table:{...table,domainVersion:'a'.repeat(64)},persisted:true}));
    fixture.componentRef.setInput('targetName','Test model');fixture.componentRef.setInput('physicalOptions',[...options,{...options[0],table:{...options[0].table,id:'retired-table',domainAssignable:false}}]);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement,confirm=vi.fn(),close=vi.fn();component.confirmed.subscribe(confirm);component.closed.subscribe(close);
    expect(root.querySelectorAll('input:checked')).toHaveLength(2);
    expect(root.querySelectorAll('input:disabled')).toHaveLength(1);
    expect(component.domains()).toEqual([active]);
    component.domainId.set(active.id);
    const checkbox=root.querySelector<HTMLInputElement>('input')!;checkbox.checked=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    component.cancel(new Event('cancel',{cancelable:true}));expect(close).toHaveBeenCalledOnce();expect(confirm).not.toHaveBeenCalled();
    component.confirm();expect(confirm).toHaveBeenCalledWith({domainId:active.id,physicalDomainTargets:[{physicalTableId:options[1].table.id,physicalSnapshotId:FALLBACK_PHYSICAL_SNAPSHOT.id,expectedDomainVersion:'a'.repeat(64)}]});
    fixture.componentRef.setInput('busy',true);fixture.componentRef.setInput('error','Versionskonflikt');fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Versionskonflikt');
    expect(root.querySelectorAll('input:checked')).toHaveLength(1);
    component.confirm();expect(confirm).toHaveBeenCalledTimes(1);
  });
});

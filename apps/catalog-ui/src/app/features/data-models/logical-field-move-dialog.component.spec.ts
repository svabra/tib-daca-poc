import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalFieldMoveDialogComponent } from './logical-field-move-dialog.component';
import { FALLBACK_LOGICAL_MODEL } from './mapping-fallback';

describe('LogicalFieldMoveDialogComponent',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  function setup(fail=false){
    const target={...FALLBACK_LOGICAL_MODEL,id:'target-model',versionId:'target-v2',title:{...FALLBACK_LOGICAL_MODEL.title,de:'Zielmodell'}};
    const move=vi.fn(()=>fail?throwError(()=>new Error('Versionskonflikt')):of({body:FALLBACK_LOGICAL_MODEL,etag:'"3"'}));
    TestBed.configureTestingModule({imports:[LogicalFieldMoveDialogComponent],providers:[{provide:DataModelsApiService,useValue:{listLogicalModels:()=>of([FALLBACK_LOGICAL_MODEL,target,{...target,id:'foreign',office:'other-office'}]),loadLogicalModel:()=>of({body:target,etag:'"2"'}),moveLogicalField:move}}]});
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
    const fixture=TestBed.createComponent(LogicalFieldMoveDialogComponent),component=fixture.componentInstance;
    fixture.componentRef.setInput('source',FALLBACK_LOGICAL_MODEL);fixture.componentRef.setInput('fieldId','field-root');fixture.componentRef.setInput('fieldName','bezeichnung');fixture.componentRef.setInput('sourceEntity','Organisationseinheiten');fixture.componentRef.setInput('editableOrganizations',['vbs-verteidigung']);fixture.detectChanges();
    return{fixture,component,move,target,root:fixture.nativeElement as HTMLElement};
  }
  it('searches other models, disables unauthorized targets and requires both explicit confirmations',()=>{
    const {fixture,component,move,root}=setup();
    expect(component.candidates()).toHaveLength(2);expect(root.querySelectorAll('.model-results button:disabled')).toHaveLength(1);
    component.query.set('Zielmodell');fixture.detectChanges();expect(component.candidates()).toHaveLength(2);
    component.select('target-model');component.review();fixture.detectChanges();
    expect(root.querySelector('.move-warning')?.textContent).toContain('nicht ins Zielmodell übernommen');
    component.move();expect(move).not.toHaveBeenCalled();
    component.acknowledged.set(true);component.confirmation.set('falsch');component.move();expect(move).not.toHaveBeenCalled();
    component.confirmation.set('bezeichnung');component.move();
    expect(move).toHaveBeenCalledWith(FALLBACK_LOGICAL_MODEL.id,'field-root',{sourceVersionId:FALLBACK_LOGICAL_MODEL.versionId,targetModelId:'target-model',targetVersionId:'target-v2',targetEntityId:'entity-org'});
  });
  it('cancel performs no move and failures retain the selected destination and confirmation',()=>{
    const {fixture,component,move,root}=setup(true);const closed=vi.fn();component.closed.subscribe(closed);
    component.select('target-model');component.review();component.cancel(new Event('cancel',{cancelable:true}));expect(closed).toHaveBeenCalledOnce();expect(move).not.toHaveBeenCalled();
    component.acknowledged.set(true);component.confirmation.set('bezeichnung');component.move();fixture.detectChanges();
    expect(root.querySelector('[role=alert]')?.textContent).toContain('Versionskonflikt');expect(component.target()?.id).toBe('target-model');expect(component.confirmation()).toBe('bezeichnung');
  });
});

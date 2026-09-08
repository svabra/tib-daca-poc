import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DataModelsApiService } from './data-models-api.service';
import { LogicalModelGovernanceComponent } from './logical-model-governance.component';
import { FALLBACK_LOGICAL_MODEL } from './mapping-fallback';

describe('LogicalModelGovernanceComponent',()=>{
  it('renders immutable history and separate DCAT/I14Y readiness results',()=>{
    TestBed.configureTestingModule({imports:[LogicalModelGovernanceComponent],providers:[{provide:DataModelsApiService,useValue:{
      listLogicalModelVersions:vi.fn(()=>of([FALLBACK_LOGICAL_MODEL,{...FALLBACK_LOGICAL_MODEL,versionId:'fallback-model-version-1',revision:1,status:'review_pending' as const}])),
      loadLogicalModelReadiness:vi.fn(()=>of({logicalModelId:FALLBACK_LOGICAL_MODEL.id,logicalModelVersionId:FALLBACK_LOGICAL_MODEL.versionId,datasetId:'dataset-1',dcatReady:true,i14yReady:false,dcatIssues:[],i14yIssues:['I14Y readiness requires a distribution or data service']})),
    }}]});
    const fixture=TestBed.createComponent(LogicalModelGovernanceComponent);fixture.componentRef.setInput('model',FALLBACK_LOGICAL_MODEL);fixture.detectChanges();
    const text=(fixture.nativeElement as HTMLElement).textContent??'';
    expect(text).toContain('Versionshistorie');expect(text).toContain('Version 2');expect(text).toContain('Version 1');
    expect(text).toContain('DCAT-AP-CH · Bereit');expect(text).toContain('I14Y · Offen');expect(text).toContain('Eine Distribution oder ein Data Service ist erforderlich.');
  });
});

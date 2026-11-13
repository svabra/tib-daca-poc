import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from '../core/demo-identity.service';
import { EndpointDescriptor } from '../core/catalog.models';
import { DaaifDownloadLinkComponent } from './daaif-download-link.component';
import { daaifHttpRepresentations } from './daaif-http-formats';

const types={rest:'application/json',csv:'text/csv; charset=utf-8',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',parquet:'application/vnd.apache.parquet'};
const endpoints:EndpointDescriptor[]=Object.entries(types).map(([format,mediaType])=>({id:format,protocol:'http-rest',method:'GET',title:format,mediaType,
  url:'http://127.0.0.1:8011/api/public/data-products/mwst-sg'+(format==='rest'?'':'/download/'+format)}));

describe('DAAIF format selection',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('selects registered formats and carries the current identity to DAAIF without reading records in DaCa',async()=>{
    const userId=signal('jan.waser');
    await TestBed.configureTestingModule({imports:[DaaifDownloadLinkComponent],providers:[{provide:DemoIdentityService,useValue:{userId}}]}).compileComponents();
    const fixture=TestBed.createComponent(DaaifDownloadLinkComponent);
    fixture.componentRef.setInput('endpoints',endpoints);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('option')).toHaveLength(4);
    const select=root.querySelector('select')!;
    select.value='xlsx';select.dispatchEvent(new Event('change'));fixture.detectChanges();
    const link=root.querySelector('a')!;
    expect(link.href).toBe('http://127.0.0.1:8011/dataproducts/mwst-sg?demoUser=jan.waser&format=xlsx');
    expect(link.textContent).toContain('herunterladen');
    userId.set('kassandra.valdata');fixture.detectChanges();
    expect(link.href).toContain('demoUser=kassandra.valdata&format=xlsx');
    fixture.componentRef.setInput('endpoints',[endpoints[0]]);fixture.detectChanges();
    expect(root.querySelectorAll('option')).toHaveLength(1);
    expect(link.href).toContain('format=rest');
    fixture.componentRef.setInput('endpoints',[]);fixture.detectChanges();
    expect(root.querySelector('a')).toBeNull();
  });

  it('does not invent formats or turn unsafe and unrelated descriptors into download links',()=>{
    const rest=endpoints[0] as Extract<EndpointDescriptor,{protocol:'http-rest'}>;
    const candidates:EndpointDescriptor[]=[
      {...rest,id:'unsafe',url:'javascript:alert(1)'},
      {...rest,id:'credentials',url:'http://user:secret@example.test/api/public/data-products/mwst-sg'},
      {...rest,id:'query',url:rest.url+'?token=secret'},
      {...rest,id:'wrong-media',mediaType:'text/html'},
      {...rest,id:'unknown-format',url:rest.url+'/download/xml'},
      {...rest,id:'post',method:'POST'},
      rest,rest,
    ];
    expect(daaifHttpRepresentations(candidates,'jan.waser').map(item=>item.format)).toEqual(['rest']);
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CatalogApiService } from '../../core/catalog-api.service';
import { DemoIdentityService, DemoUser } from '../../core/demo-identity.service';
import { I14yConceptsApiService } from '../domains/i14y-concepts-api.service';
import { DataModelsApiService, LogicalModelExportFile, ModelingApiError } from './data-models-api.service';
import { I14yConceptReference, LogicalField, LogicalModelWrite } from './data-models.models';
import { LogicalModelEditorComponent, logicalModelVersionEtag, normalizeFieldConceptSelection } from './logical-model-editor.component';
import { logicalModelHelpLocale } from './logical-model-field-help.directive';
import { FALLBACK_LOGICAL_MODEL } from './mapping-fallback';
import { ModelingAssistanceService, TermdatEntry } from './modeling-assistance.service';

const REFERENCES:I14yConceptReference[]=[
  {id:'concept-one',identifier:'one',uri:'https://example.test/concepts/one',version:'1.0.0',name:'Concept One',conceptType:'String'},
  {id:'concept-two',identifier:'two',uri:'https://example.test/concepts/two',version:'2.0.0',name:'Concept Two',conceptType:'String'},
];

describe('LogicalModelEditorComponent contracts',()=>{
  const actor:DemoUser={id:'cinthya.thor',displayName:'Cinthya Thor',organization:'Verteidigung',email:'cinthya.thor@vtg.admin.ch',phone:null,avatarUrl:null,roles:['data_consumer'],department:'VBS',office:'vbs-verteidigung',primaryModelingRole:'data_steward'};
  let download:ReturnType<typeof vi.fn>;
  let retire:ReturnType<typeof vi.fn>;
  let createLogicalModel:ReturnType<typeof vi.fn>;
  let searchTermdat:ReturnType<typeof vi.fn>;
  let scrollIntoView:ReturnType<typeof vi.fn>;
  let canPublish:ReturnType<typeof signal<boolean>>;

  beforeEach(()=>{
    download=vi.fn();
    retire=vi.fn();
    createLogicalModel=vi.fn(()=>of({body:FALLBACK_LOGICAL_MODEL,etag:'"1"'}));
    searchTermdat=vi.fn(()=>of({items:[],total:0}));
    scrollIntoView=vi.fn();
    Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:scrollIntoView});
    canPublish=signal(false);
    TestBed.configureTestingModule({
      imports:[LogicalModelEditorComponent],
      providers:[
        provideRouter([]),
        {provide:DemoIdentityService,useValue:{user:signal(actor).asReadonly(),users:signal([actor]).asReadonly(),modelingRoles:()=>['data_steward'],canPublishModels:signal(false).asReadonly(),canPublishModel:()=>canPublish(),canEditModels:signal(true).asReadonly()}},
        {provide:CatalogApiService,useValue:{domains:signal([{id:'11111111-1111-4111-8111-111111111111',urn:'urn:daca:domain:personal',originCatalogId:'catalog',revision:1,status:'active',preferredLabel:'Personal',definition:'',labels:[],ownerUserId:'christian.spider',ownerName:'Christian Spider',ownerOrganization:'Verteidigung',deputyOwnerUserId:'sibilla.micheli',deputyOwnerName:'Sibilla Micheli',deputyOwnerOrganization:'Verteidigung',productCount:0,termCount:0,updatedAt:''}]).asReadonly(),loadDomains:()=>of([]),refreshWorkflowTasks:vi.fn()}},
        {provide:I14yConceptsApiService,useValue:{search:()=>of({items:[],total:0}),load:vi.fn()}},
        {provide:ModelingAssistanceService,useValue:{organizations:()=>of([]),myScopes:()=>of([]),personas:()=>of([]),businessObjects:()=>of({items:[],total:0}),translate:()=>of({sourceTextHash:'source-hash',translations:{},retrievedAt:'2026-09-08T10:00:00Z',payloadHash:'payload-hash'}),searchTermdat}},
        {provide:DataModelsApiService,useValue:{createLogicalModel,downloadLogicalModelExport:download,retireLogicalModel:retire,listLogicalModelVersions:()=>of([FALLBACK_LOGICAL_MODEL]),loadLogicalModelReadiness:()=>of({logicalModelId:FALLBACK_LOGICAL_MODEL.id,logicalModelVersionId:FALLBACK_LOGICAL_MODEL.versionId,datasetId:'dataset-1',dcatReady:true,i14yReady:false,dcatIssues:[],i14yIssues:['I14Y readiness requires a distribution or data service']})}},
      ],
    });
  });
  afterEach(()=>{vi.restoreAllMocks();TestBed.resetTestingModule();});

  it('uses the latest version lock for version-specific writes after a root reload',()=>{
    const reloadedModel={...FALLBACK_LOGICAL_MODEL,revision:7,lockVersion:2};
    expect(logicalModelVersionEtag(reloadedModel)).toBe('"2"');
  });

  it('selects German, French or Italian help from the browser language and otherwise falls back to German',()=>{
    expect(logicalModelHelpLocale('fr-CH')).toBe('fr');
    expect(logicalModelHelpLocale('it')).toBe('it');
    expect(logicalModelHelpLocale('en-US')).toBe('de');
    expect(logicalModelHelpLocale(null)).toBe('de');
  });

  it('shows accessible semantic help on hover and keyboard focus',()=>{
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);fixture.detectChanges();
    const host=(fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.termdat-title-field')!;
    const trigger=host.querySelector<HTMLButtonElement>('.daca-field-help-trigger')!;
    const tooltip=document.getElementById(trigger.getAttribute('aria-describedby')!)!;
    expect(tooltip.getAttribute('role')).toBe('tooltip');
    expect(trigger.hidden).toBe(true);
    host.dispatchEvent(new MouseEvent('mouseenter'));fixture.detectChanges();
    expect(trigger.hidden).toBe(false);
    expect(tooltip.classList.contains('is-visible')).toBe(false);
    trigger.dispatchEvent(new MouseEvent('mouseenter'));fixture.detectChanges();
    expect(tooltip.classList.contains('is-visible')).toBe(true);
    expect(tooltip.textContent).toContain('Name des beschriebenen Datensatzes');
    trigger.dispatchEvent(new MouseEvent('mouseleave'));host.dispatchEvent(new MouseEvent('mouseleave'));trigger.focus();fixture.detectChanges();
    expect(tooltip.classList.contains('is-visible')).toBe(true);
    trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.detectChanges();
    expect(tooltip.classList.contains('is-visible')).toBe(false);
  });

  it('keeps save actionable and lists every insufficient field directly below it',()=>{
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);fixture.detectChanges();
    const component=fixture.componentInstance;
    const root=fixture.nativeElement as HTMLElement;
    const save=root.querySelector<HTMLButtonElement>('.save-action > button[type="submit"]')!;
    expect(save.disabled).toBe(false);
    save.click();fixture.detectChanges();

    const validation=root.querySelector<HTMLElement>('.save-action > button + .save-validation');
    expect(validation).not.toBeNull();
    expect(validation?.getAttribute('role')).toBe('alert');
    expect(validation?.textContent).toContain('Titel (Deutsch)');
    expect(validation?.textContent).toContain('DaCa-Domäne');
    expect(validation?.textContent).toContain('Feld 1 – Feldname');
    expect(validation?.textContent).toContain('Feld 1 – Geschäftsobjekt');
    expect(validation?.textContent).not.toContain('I14Y-Concept-Links');
    expect(root.querySelector('form')?.classList.contains('validation-attempted')).toBe(true);
    const title=root.querySelector<HTMLInputElement>('input[formControlName="titleDe"]')!;
    expect(title.classList.contains('ng-invalid')).toBe(true);
    component.form.controls.dataset.controls.titleDe.setValue('Gültiger Titel');fixture.detectChanges();
    expect(title.classList.contains('ng-invalid')).toBe(false);
    expect(createLogicalModel).not.toHaveBeenCalled();
  });

  it('saves a complete model without selecting any optional I14Y concept',()=>{
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    component.form.controls.dataset.patchValue({
      titleDe:'Mitarbeitende',descriptionDe:'Logisches Personalmodell',identifiers:'VBS-HR-OPTIONAL-I14Y',
      dataDomainId:'11111111-1111-4111-8111-111111111111',dataOwnerId:'christian.spider',creatorName:'HR-Core',
    });
    component.fields.at(0).patchValue({
      entityName:'mitarbeitende',entityBusinessObjectVersionId:'22222222-2222-4222-8222-222222222222',
      name:'personalnummer',businessObjectVersionId:'33333333-3333-4333-8333-333333333333',shortDescription:'Stabile Personalnummer',
      conceptIds:[],primaryConceptId:'',valueListConceptId:'',
    });
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('I14Y-Concept-Links (optional)');
    expect(root.querySelector<HTMLSelectElement>('select[formControlName="primaryConceptId"]')?.required).toBe(false);

    expect(component.validationIssues()).toEqual([]);
    component.save();

    expect(createLogicalModel).toHaveBeenCalledOnce();
    const write=createLogicalModel.mock.calls[0][0] as LogicalModelWrite;
    expect(write.conceptIds).toEqual([]);
    expect(write.fields[0].conceptIds).toEqual([]);
    expect(write.fields[0].primaryConceptId).toBeNull();
    expect(write.fields[0].valueListConceptId).toBeNull();
  });

  it('shows a clear duplicate-identifier problem, focuses the field, and retains safe support details',async()=>{
    createLogicalModel.mockReturnValue(throwError(()=>new ModelingApiError(
      'conflict',409,'Dieser Identifier wird bereits von einem anderen logischen Modell verwendet.',
      [{location:'body.identifiers.0',message:'Dieser Identifier ist bereits vergeben.',type:'unique'}],
      'DACA-LM-IDENTIFIER-DUPLICATE','Wählen Sie einen anderen Identifier.','request-duplicate-1',
      {category:'PostgreSQL integrity constraint',sqlState:'23505',constraint:'uq_logical_model_identifier_normalized',timestamp:'2026-09-15T10:00:00Z'},
    )));
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    component.form.controls.dataset.patchValue({
      titleDe:'Duplikat-Test',descriptionDe:'Prüft eine verständliche Speicherfehlermeldung.',identifiers:'DUPLICATE-ID',
      dataDomainId:'11111111-1111-4111-8111-111111111111',dataOwnerId:'christian.spider',
    });
    component.fields.at(0).patchValue({
      entityName:'duplikat',entityBusinessObjectVersionId:'22222222-2222-4222-8222-222222222222',name:'id',
      businessObjectVersionId:'33333333-3333-4333-8333-333333333333',shortDescription:'Eindeutiger Testwert.',
    });
    fixture.detectChanges();component.save();fixture.detectChanges();

    const root=fixture.nativeElement as HTMLElement;
    const panel=root.querySelector<HTMLElement>('.save-problem')!;
    expect(panel.textContent).toContain('Identifier bereits vergeben');
    expect(panel.textContent).toContain('Wählen Sie einen anderen Identifier.');
    expect(panel.textContent).toContain('DACA-LM-IDENTIFIER-DUPLICATE');
    expect(panel.textContent).toContain('request-duplicate-1');
    expect(panel.textContent).not.toContain('The requested change conflicts');
    const identifier=root.querySelector<HTMLInputElement>('input[formControlName="identifiers"]')!;
    expect(identifier.classList.contains('ng-invalid')).toBe(true);
    panel.querySelector<HTMLButtonElement>('li button')?.click();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(identifier);
    const writeText=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText}});
    await component.copyErrorMessage(component.saveProblem()!);fixture.detectChanges();
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('DACA-LM-IDENTIFIER-DUPLICATE');
    expect(writeText.mock.calls[0][0]).toContain('request-duplicate-1');
    expect(writeText.mock.calls[0][0]).not.toContain('DUPLICATE-ID');
    expect(panel.textContent).toContain('Kopiert');
    component.form.controls.dataset.controls.identifiers.setValue('FREIE-ID');fixture.detectChanges();
    expect(identifier.classList.contains('ng-invalid')).toBe(false);
  });

  it('keeps classification secret visible but unavailable for new selections',()=>{
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);fixture.detectChanges();
    const classification=(fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('.classification-hero select')!;
    const secret=[...classification.options].find((option)=>option.value==='secret');
    expect(secret?.disabled).toBe(true);
    expect([...classification.options].filter((option)=>!option.disabled).map((option)=>option.value)).toEqual(['unclassified','internal','confidential']);
  });

  it('clears optional I14Y links, primary concept, and value list independently',()=>{
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    const field=component.fields.at(0);
    field.patchValue({conceptIds:['concept-one','concept-two'],primaryConceptId:'concept-one',valueListConceptId:'concept-two'});
    component.resetPrimaryConcept(0);
    expect(field.controls.primaryConceptId.value).toBe('');
    expect(field.controls.conceptIds.value).toEqual(['concept-one','concept-two']);
    component.resetValueList(0);
    expect(field.controls.valueListConceptId.value).toBe('');
    expect(field.controls.conceptIds.value).toEqual(['concept-one']);
    component.resetConceptLinks(0);
    expect(field.controls.conceptIds.value).toEqual([]);
    expect(field.controls.primaryConceptId.value).toBe('');
  });

  it('searches TERMDAT on title blur and exposes a prominent hit action',()=>{
    const entry:TermdatEntry={entryId:'194470',uri:'https://register.ld.admin.ch/termdat/194470',preferredTerm:'gepanzertes Raupenfahrzeug',definition:'DOM: Verkehr und Transport',descriptionType:'note',languages:{de:{term:'gepanzertes Raupenfahrzeug',definition:'DOM: Verkehr und Transport',descriptionType:'note',source:'VMSV'}},status:'Validiert',reliability:'Sprachlich/formal überprüft',collection:'Militärische Terminologie des VBS',classification:'VERTEIDIGUNG',subjects:['VERTEIDIGUNG'],source:'VMSV',payloadHash:'hash',sourceModifiedAt:null,retrievedAt:'2026-09-08T10:00:00Z'};
    searchTermdat.mockReturnValue(of({items:[entry],total:1}));
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const input=root.querySelector<HTMLInputElement>('input[formControlName="titleDe"]')!;
    const inputGroup=root.querySelector<HTMLElement>('.termdat-input-group')!;
    expect(inputGroup.contains(input)).toBe(true);
    expect(inputGroup.querySelector('button')?.textContent).toContain('In TERMDAT suchen');
    input.value='panzer';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('blur'));fixture.detectChanges();

    expect(searchTermdat).toHaveBeenCalledWith('panzer');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 öffentlich publizierte TERMDAT-Treffer gefunden.');
    expect([...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].some((button)=>button.textContent?.includes('Treffer anzeigen'))).toBe(true);
  });

  it('shows the DAAIF-style spinner while the automatic TERMDAT search is pending',()=>{
    const pendingSearch=new Subject<{items:TermdatEntry[];total:number}>();
    searchTermdat.mockReturnValue(pendingSearch);
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);fixture.detectChanges();
    const input=(fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[formControlName="titleDe"]')!;
    input.value='panzer';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('blur'));fixture.detectChanges();

    const spinner=(fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.termdat-feedback .termdat-spinner');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('TERMDAT wird nach Verlassen des Titelfelds automatisch durchsucht');
  });

  it('previews and copies a TERMDAT note fallback without a browser prompt',()=>{
    const entry:TermdatEntry={entryId:'194470',uri:'https://register.ld.admin.ch/termdat/194470',preferredTerm:'gepanzertes Raupenfahrzeug',definition:'DOM: Verkehr und Transport',descriptionType:'note',languages:{de:{term:'gepanzertes Raupenfahrzeug',definition:'DOM: Verkehr und Transport',descriptionType:'note',source:'VMSV'}},status:'Validiert',reliability:'Sprachlich/formal überprüft',collection:'Militärische Terminologie des VBS',classification:'VERTEIDIGUNG',subjects:['VERTEIDIGUNG'],source:'VMSV',payloadHash:'hash',sourceModifiedAt:null,retrievedAt:'2026-09-08T10:00:00Z'};
    const browserConfirm=vi.spyOn(window,'confirm');
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    component.form.controls.dataset.controls.descriptionDe.setValue('Bestehender Text');
    component.useTermdat(entry,'definition');

    expect(component.form.controls.dataset.controls.descriptionDe.value).toBe('Bestehender Text');
    expect(component.termdatSelection()?.targets).toEqual(['definition']);
    component.confirmTermdatSelection();

    expect(browserConfirm).not.toHaveBeenCalled();
    expect(component.form.controls.dataset.controls.descriptionDe.value).toBe('DOM: Verkehr und Transport');
    expect(component.assistanceProvenance()[0]?.sourceIdentifier).toBe('194470');
  });

  it('previews, auto-scrolls and applies title and description together',async()=>{
    const entry:TermdatEntry={entryId:'194470',uri:'https://register.ld.admin.ch/termdat/194470',preferredTerm:'gepanzertes Raupenfahrzeug',definition:'DOM: Verkehr und Transport',descriptionType:'note',languages:{de:{term:'gepanzertes Raupenfahrzeug',definition:'DOM: Verkehr und Transport',descriptionType:'note',source:'VMSV'}},status:'Validiert',reliability:'Sprachlich/formal überprüft',collection:'Militärische Terminologie des VBS',classification:'VERTEIDIGUNG',subjects:['VERTEIDIGUNG'],source:'VMSV',payloadHash:'hash',sourceModifiedAt:null,retrievedAt:'2026-09-08T10:00:00Z'};
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    component.form.controls.dataset.controls.titleDe.setValue('Panzer');
    component.form.controls.dataset.controls.descriptionDe.setValue('Bestehender Text');
    component.termdatOpen.set(true);component.termdatResults.set([entry]);fixture.detectChanges();

    const combinedButton=[...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].find((button)=>button.textContent?.trim()==='Titel und Beschreibung übernehmen');
    expect(combinedButton).toBeDefined();
    combinedButton?.click();fixture.detectChanges();await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Welche Angaben werden geändert?');
    expect(scrollIntoView).toHaveBeenCalledWith({behavior:'smooth',block:'start'});
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Bestehende Inhalte vorhanden.');
    expect(component.form.controls.dataset.controls.titleDe.value).toBe('Panzer');
    expect(component.form.controls.dataset.controls.descriptionDe.value).toBe('Bestehender Text');

    const overwriteButton=[...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].find((button)=>button.textContent?.trim()==='Bestehende Werte überschreiben');
    expect(overwriteButton).toBeDefined();
    overwriteButton?.click();
    expect(component.form.controls.dataset.controls.titleDe.value).toBe('gepanzertes Raupenfahrzeug');
    expect(component.form.controls.dataset.controls.descriptionDe.value).toBe('DOM: Verkehr und Transport');
    expect(component.assistanceProvenance().filter((item)=>item.sourceIdentifier==='194470')).toHaveLength(2);
  });

  it('preserves multiple field concept links and their distinct primary I14Y concept',()=>{
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    const field:LogicalField={...FALLBACK_LOGICAL_MODEL.fields[0],conceptReferences:REFERENCES,primaryConceptId:'concept-two'};
    component.model.set({...FALLBACK_LOGICAL_MODEL,fields:[field],fieldCount:1});
    component.fields.clear();component.fields.push(component.createField(1,field));
    fixture.detectChanges();

    const control=component.fields.at(0).getRawValue();
    expect(control.conceptIds).toEqual(['concept-one','concept-two']);
    expect(control.primaryConceptId).toBe('concept-two');
    const root=fixture.nativeElement as HTMLElement;
    const multi=root.querySelector<HTMLSelectElement>('select[formControlName="conceptIds"]')!;
    const primary=root.querySelector<HTMLSelectElement>('select[formControlName="primaryConceptId"]')!;
    expect(multi.multiple).toBe(true);
    expect([...multi.selectedOptions]).toHaveLength(2);
    expect([...multi.selectedOptions].map((option)=>option.textContent?.trim())).toEqual(['Concept One · v1.0.0','Concept Two · v2.0.0']);
    expect(primary.value).toBe('concept-two');

    const write=(component as unknown as {value():LogicalModelWrite}).value();
    expect(write.fields[0].conceptIds).toEqual(['concept-one','concept-two']);
    expect(write.fields[0].primaryConceptId).toBe('concept-two');
    expect(normalizeFieldConceptSelection(['concept-one','concept-one','concept-two'],'concept-two',null)).toEqual({conceptIds:['concept-one','concept-two'],primaryConceptId:'concept-two'});
  });

  it('offers accessible authenticated export buttons and saves the returned blob',()=>{
    const file:LogicalModelExportFile={blob:new Blob(['@prefix dcat: <http://www.w3.org/ns/dcat#>.'],{type:'text/turtle'}),filename:'modell-dcat.ttl'};
    download.mockReturnValue(of(file));
    const createObjectURL=vi.fn(()=> 'blob:logical-model-export');const revokeObjectURL=vi.fn();
    Object.defineProperty(URL,'createObjectURL',{configurable:true,value:createObjectURL});
    Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revokeObjectURL});
    const anchorClick=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined);
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);fixture.componentInstance.model.set(FALLBACK_LOGICAL_MODEL);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const exportSection=root.querySelector<HTMLElement>('.export-section')!;
    const buttons=[...exportSection.querySelectorAll<HTMLButtonElement>('button')];

    expect(exportSection.querySelector('a[href]')).toBeNull();
    expect(buttons.map((button)=>button.textContent?.trim())).toEqual(['DCAT TTL herunterladen','DCAT JSON-LD herunterladen','SHACL TTL herunterladen','SHACL JSON-LD herunterladen']);
    buttons[0].click();

    expect(download).toHaveBeenCalledWith(FALLBACK_LOGICAL_MODEL.id,FALLBACK_LOGICAL_MODEL.versionId,'dcat-ttl');
    expect(createObjectURL).toHaveBeenCalledWith(file.blob);
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:logical-model-export');
    expect(fixture.componentInstance.notice()).toContain(file.filename);
  });

  it('offers retirement only for a published model and forwards its current version ETag',()=>{
    canPublish.set(true);
    const published={...FALLBACK_LOGICAL_MODEL,status:'published' as const,revision:7,lockVersion:1,versionId:'published-version'};
    const retired={...published,status:'retired' as const,revision:8,versionId:'retired-version'};
    retire.mockReturnValue(of({body:retired,etag:'"1"'}));
    vi.spyOn(window,'confirm').mockReturnValue(true);
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    component.model.set(published);component.etag.set('"1"');fixture.detectChanges();

    const button=[...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')].find((item)=>item.textContent?.includes('Modell stilllegen'));
    expect(button?.disabled).toBe(false);
    button?.click();

    expect(retire).toHaveBeenCalledWith(published.id,published.versionId,'"1"');
    expect(component.model()?.status).toBe('retired');
    expect(component.etag()).toBe('"1"');
    expect(component.notice()).toContain('Versionshistorie bleibt erhalten');
  });

  it('round-trips Romansh text and multiple entity roots without persisting a model-level steward',()=>{
    const fixture=TestBed.createComponent(LogicalModelEditorComponent);const component=fixture.componentInstance;
    const firstField={...FALLBACK_LOGICAL_MODEL.fields[0],entityName:'Mitarbeitende'};
    const secondField={...FALLBACK_LOGICAL_MODEL.fields[1],id:'field-address-v1',rootId:'field-address',versionId:'field-address-v1',entityName:'Adressen',name:'strasse',businessObject:'Adresse'};
    const model={...FALLBACK_LOGICAL_MODEL,title:{...FALLBACK_LOGICAL_MODEL.title,rm:'Collavuraturs'},description:{...FALLBACK_LOGICAL_MODEL.description,rm:'Model logic da collavuraturs'},entityName:'Mitarbeitende',fields:[firstField,secondField],fieldCount:2,entities:[
      {id:'entity-person-v1',rootId:'entity-person',versionId:'entity-person-v1',name:'Mitarbeitende',businessObject:'Mitarbeitende',comment:'Personenstamm',order:1,fields:[firstField]},
      {id:'entity-address-v1',rootId:'entity-address',versionId:'entity-address-v1',name:'Adressen',businessObject:'Adresse',comment:null,order:2,fields:[secondField]},
    ]};
    component.model.set(model);
    (component as unknown as {patch(value:typeof model):void}).patch(model);
    fixture.detectChanges();

    const write=(component as unknown as {value():LogicalModelWrite}).value();
    expect(write.title.rm).toBe('Collavuraturs');
    expect(write.description.rm).toBe('Model logic da collavuraturs');
    expect(write.entities?.map((entity)=>({id:entity.id,name:entity.name,comment:entity.comment}))).toEqual([
      {id:'entity-person',name:'Mitarbeitende',comment:'Personenstamm'},
      {id:'entity-address',name:'Adressen',comment:null},
    ]);
    expect(write.entities?.map((entity)=>entity.fields.map((field)=>field.name))).toEqual([['organisationseinheit_id'],['strasse']]);
    expect('stewardId' in component.form.controls.dataset.controls).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Diese Rolle gilt organisationsweit');
  });
});

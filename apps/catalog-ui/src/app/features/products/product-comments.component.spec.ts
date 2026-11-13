import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DemoIdentityService } from '../../core/demo-identity.service';
import { ProductComment, ProductCommentPage, ProductCommentsApiService } from './product-comments-api.service';
import { ProductCommentsComponent } from './product-comments.component';

const visible: ProductComment = {id:'public',text:'Öffentliche Rückfrage',visibility:'public',createdAt:'2026-11-12T12:00:00Z',authorUserId:'jan.waser',authorName:'Jan Waser',authorOrganization:'Kanton St. Gallen'};
const privateComment: ProductComment = {...visible,id:'private',text:'Privater Inhalt für den Data Owner',visibility:'private'};
const publicPage: ProductCommentPage = {items:[visible],canViewPrivate:false,nextOffset:null};
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(done=>{resolve=done;}); return {promise,resolve}; }

async function render() {
  const actor=signal('jan.waser');
  const api={list:vi.fn().mockResolvedValue(publicPage),create:vi.fn().mockResolvedValue({id:'new',visibility:'private',createdAt:visible.createdAt}),deletePublic:vi.fn().mockResolvedValue(undefined)};
  await TestBed.configureTestingModule({imports:[ProductCommentsComponent],providers:[
    {provide:DemoIdentityService,useValue:{userId:actor}}, {provide:ProductCommentsApiService,useValue:api},
  ]}).compileComponents();
  const fixture=TestBed.createComponent(ProductCommentsComponent);
  fixture.componentRef.setInput('productId','product-id');
  fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
  const dialog=(fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog')!;
  Object.defineProperties(dialog,{
    showModal:{value:vi.fn(()=>dialog.setAttribute('open',''))},
    close:{value:vi.fn(()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));})},
  });
  return {fixture,component:fixture.componentInstance,actor,api,dialog};
}

describe('Product comment privacy and composer',()=>{
  it('explains public deletion and exposes delete only for the author of public comments',async()=>{
    const {fixture,component,actor,api}=await render();
    expect(fixture.nativeElement.textContent).toContain('Sie können Ihren öffentlichen Kommentar später wieder löschen.');
    expect(fixture.nativeElement.querySelector('.comment-delete-actions button')?.textContent).toContain('Kommentar löschen');
    expect(component.canDelete(privateComment)).toBe(false);
    api.list.mockResolvedValueOnce({items:[visible,privateComment],canViewPrivate:true,nextOffset:null});
    actor.set('kassandra.valdata');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.comment-delete-actions')).toBeNull();
  });

  it('requires an explicit confirmation and refreshes the list after deleting an own public comment',async()=>{
    const {fixture,component,api}=await render();
    await component.deletePublicComment(visible);expect(api.deletePublic).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('.comment-delete-actions button') as HTMLButtonElement).click();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Öffentlichen Kommentar dauerhaft löschen?');
    api.list.mockResolvedValueOnce({items:[],canViewPrivate:false,nextOffset:null});
    await component.deletePublicComment(visible);fixture.detectChanges();
    expect(api.deletePublic).toHaveBeenCalledWith('product-id',visible.id);
    expect(component.items()).toEqual([]);expect(component.notice()).toContain('Kommentar gelöscht');
  });

  it('does not show another identity a late deletion receipt',async()=>{
    const {fixture,component,actor,api}=await render();
    const pending=deferred<void>();api.deletePublic.mockReturnValueOnce(pending.promise);
    component.pendingDeletion.set(visible.id);const deletion=component.deletePublicComment(visible);
    actor.set('kassandra.valdata');fixture.detectChanges();await fixture.whenStable();
    pending.resolve();await deletion;
    expect(component.notice()).toBe('');expect(component.pendingDeletion()).toBeNull();
  });
  it('defaults to private and gives the author a receipt without showing private text',async()=>{
    const {fixture,component,api}=await render();
    component.openComposer();expect(component.visibility).toBe('private');
    component.text='Eine private fachliche Frage';await component.saveComment();fixture.detectChanges();
    expect(api.create).toHaveBeenCalledWith('product-id','Eine private fachliche Frage','private');
    expect(component.text).toBe('');expect(component.notice()).toContain('Nur der zuständige Data Owner');
    expect(fixture.nativeElement.textContent).not.toContain('Eine private fachliche Frage');
    expect(component.items()).toEqual([visible]);
  });

  it('ignores a late owner response after switching to a reader',async()=>{
    const {fixture,component,actor,api}=await render();
    const pending=deferred<ProductCommentPage>();api.list.mockReturnValueOnce(pending.promise);
    actor.set('kassandra.valdata');fixture.detectChanges();
    actor.set('jan.waser');fixture.detectChanges();await fixture.whenStable();
    pending.resolve({items:[privateComment],canViewPrivate:true,nextOffset:null});
    await Promise.resolve();await Promise.resolve();fixture.detectChanges();
    expect(component.items()).toEqual([visible]);expect(component.canViewPrivate()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain(privateComment.text);
  });

  it('removes private comments and unsent drafts immediately on identity change',async()=>{
    const {fixture,component,actor,api,dialog}=await render();
    api.list.mockResolvedValueOnce({items:[privateComment],canViewPrivate:true,nextOffset:null});
    actor.set('kassandra.valdata');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(privateComment.text);
    component.openComposer();component.text='Ungesendeter privater Entwurf';
    actor.set('jan.waser');fixture.detectChanges();
    expect(component.text).toBe('');expect(dialog.open).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain(privateComment.text);
    await fixture.whenStable();
  });

  it('prevents duplicate submissions and drops a stale receipt for another identity',async()=>{
    const {fixture,component,actor,api}=await render();
    const pending=deferred<{id:string;visibility:'private';createdAt:string}>();api.create.mockReturnValueOnce(pending.promise);
    component.text='Fachlicher Hinweis';const first=component.saveComment();await component.saveComment();
    expect(api.create).toHaveBeenCalledTimes(1);
    actor.set('kassandra.valdata');fixture.detectChanges();await fixture.whenStable();
    pending.resolve({id:'new',visibility:'private',createdAt:visible.createdAt});await first;
    expect(component.notice()).toBe('');expect(component.saving()).toBe(false);
  });

  it('keeps the current draft after a save error and clears it on cancellation',async()=>{
    const {component,api}=await render();component.openComposer();
    api.create.mockRejectedValueOnce(new Error('backend error with private payload'));
    component.text='Mein Kommentar';await component.saveComment();
    expect(component.text).toBe('Mein Kommentar');expect(component.formError()).not.toContain('private payload');
    component.closeComposer();expect(component.text).toBe('');
  });
});

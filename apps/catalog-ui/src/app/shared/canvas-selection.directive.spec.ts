import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanvasSelectionAdapter, CanvasSelectionDirective, CanvasSelectionItem } from './canvas-selection.directive';

@Component({standalone:true,imports:[CanvasSelectionDirective],template:`<div tabindex="0" [dacaCanvasSelection]="selection">@for(item of positions();track item.id){<article [attr.data-canvas-object]="item.id"><span>{{item.id}}</span><button (pointerdown)="port()">Port</button><a href="/details" (click)="opened($event)">Details</a></article>}</div>`})
class CanvasTest {
  readonly context=signal('first');readonly editable=signal(true);readonly dirty=signal(false);
  readonly positions=signal<readonly CanvasSelectionItem[]>([{id:'a',x:40,y:40},{id:'b',x:160,y:40},{id:'c',x:360,y:250}]);
  readonly port=vi.fn();readonly navigation=vi.fn();
  opened(event:Event){event.preventDefault();this.navigation();}
  readonly selection:CanvasSelectionAdapter={
    context:()=>this.context(),items:()=>this.positions(),enabled:()=>this.editable(),
    begin:()=>({positions:this.positions(),dirty:this.dirty()}),
    move:items=>{const moved=new Map(items.map(item=>[item.id,item]));this.positions.update(items=>items.map(item=>moved.get(item.id)??item));},
    finish:()=>this.dirty.set(true),cancel:snapshot=>{const before=snapshot as {positions:CanvasSelectionItem[];dirty:boolean};this.positions.set(before.positions);this.dirty.set(before.dirty);},
  };
}
describe('Shared canvas rectangle selection',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  function setup(scale=1){
    const fixture=TestBed.createComponent(CanvasTest),component=fixture.componentInstance;fixture.detectChanges();
    const root=(fixture.nativeElement as HTMLElement).querySelector('div')!;
    let origin={x:20,y:30};
    Object.defineProperty(root,'offsetWidth',{value:500});Object.defineProperty(root,'offsetHeight',{value:400});
    root.getBoundingClientRect=()=>new DOMRect(origin.x,origin.y,500*scale,400*scale);
    for(const element of root.querySelectorAll<HTMLElement>('[data-canvas-object]'))element.getBoundingClientRect=()=>{
      const item=component.positions().find(item=>item.id===element.dataset['canvasObject'])!;
      return new DOMRect(origin.x+item.x*scale,origin.y+item.y*scale,80*scale,60*scale);
    };
    const point=(type:string,x:number,y:number,target:EventTarget=root,extra:PointerEventInit={})=>target.dispatchEvent(new PointerEvent(type,{isPrimary:true,pointerId:7,button:0,buttons:type==='pointerup'?0:1,clientX:origin.x+x*scale,clientY:origin.y+y*scale,bubbles:true,cancelable:true,...extra}));
    const select=()=>{point('pointerdown',25,25);point('pointermove',260,120,document);point('pointerup',260,120,document);fixture.detectChanges();};
    return{fixture,component,root,point,select,scroll:()=>{origin={x:-80,y:-70};}};
  }
  it('selects enclosed cards and translates them as a group while leaving other cards in place',()=>{
    const {fixture,component,root,point,select}=setup();select();
    expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(2);expect(root.querySelector('[data-canvas-marquee]')).toBeNull();
    const a=root.querySelector<HTMLElement>('[data-canvas-object=a] span')!;
    point('pointerdown',60,60,a);point('pointermove',100,90,document);point('pointerup',100,90,document);fixture.detectChanges();
    expect(component.positions().map(item=>[item.x,item.y])).toEqual([[80,70],[200,70],[360,250]]);expect(component.dirty()).toBe(true);
    expect(component.port).not.toHaveBeenCalled();
    const click=new MouseEvent('click',{detail:1,bubbles:true,cancelable:true});a.dispatchEvent(click);expect(click.defaultPrevented).toBe(true);
  });
  it('draws the rectangle in either direction at zoom and accounts for viewport scrolling',()=>{
    const {fixture,component,root,point,scroll}=setup(.5);
    point('pointerdown',260,120);point('pointermove',25,25,document);fixture.detectChanges();
    expect(root.querySelector<HTMLElement>('[data-canvas-marquee]')?.style.width).toBe('235px');
    point('pointerup',25,25,document);fixture.detectChanges();expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(2);
    point('pointerdown',60,60,root.querySelector('[data-canvas-object=a]')!);scroll();
    point('pointermove',100,80,document);point('pointerup',100,80,document);fixture.detectChanges();
    expect(component.positions()[0]).toMatchObject({x:80,y:60});
  });
  it('clamps the entire group with a common delta, preserves spacing and supports group arrow keys',()=>{
    const {component,root,point,select,fixture}=setup();select();
    // Fullscreen editors themselves use role=dialog; this must not swallow selection keys.
    (fixture.nativeElement as HTMLElement).setAttribute('role','dialog');
    point('pointerdown',60,60,root.querySelector('[data-canvas-object=a]')!);point('pointermove',-100,-100,document);point('pointerup',-100,-100,document);fixture.detectChanges();
    expect(component.positions().slice(0,2).map(item=>[item.x,item.y])).toEqual([[15,15],[135,15]]);
    root.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true,cancelable:true}));
    expect(component.positions().slice(0,2).map(item=>item.x)).toEqual([55,175]);
  });
  it('cancels a group move atomically on Escape or pointer cancel and leaves selection available',()=>{
    const {fixture,component,root,point,select}=setup();select();const before=component.positions();
    for(const cancel of ['Escape','pointercancel']){
      point('pointerdown',60,60,root.querySelector('[data-canvas-object=a]')!);point('pointermove',100,100,document);fixture.detectChanges();
      if(cancel==='Escape')root.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));else point('pointercancel',100,100,document);
      fixture.detectChanges();expect(component.positions()).toEqual(before);expect(component.dirty()).toBe(false);expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(2);
    }
    root.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));fixture.detectChanges();expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(0);
  });
  it('allows additive selection and clears it on a blank click or a context change',()=>{
    const {fixture,component,root,point,select}=setup();select();
    point('pointerdown',380,270,root.querySelector('[data-canvas-object=c]')!,{ctrlKey:true});fixture.detectChanges();expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(3);
    const click=new MouseEvent('click',{detail:1,bubbles:true,cancelable:true});root.querySelector('[data-canvas-object=c]')!.dispatchEvent(click);expect(click.defaultPrevented).toBe(true);
    point('pointerdown',60,60,root.querySelector('[data-canvas-object=a]')!,{shiftKey:true});fixture.detectChanges();expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(2);
    component.context.set('second');fixture.detectChanges();expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(0);
    select();point('pointerdown',300,200);point('pointerup',300,200,document);fixture.detectChanges();expect(root.querySelectorAll('[data-canvas-selected]')).toHaveLength(0);
  });
  it('respects read-only layouts and leaves ports and nested detail links usable',()=>{
    const {fixture,component,root,point,select}=setup();select();component.editable.set(false);
    const before=component.positions();point('pointerdown',60,60,root.querySelector('[data-canvas-object=a]')!);point('pointermove',150,150,document);point('pointerup',150,150,document);fixture.detectChanges();
    expect(component.positions()).toEqual(before);expect(component.dirty()).toBe(false);
    point('pointerdown',60,60,root.querySelector('[data-canvas-object=a] button')!);expect(component.port).toHaveBeenCalledOnce();
    root.querySelector<HTMLAnchorElement>('a')!.click();expect(component.navigation).toHaveBeenCalledOnce();
  });
});

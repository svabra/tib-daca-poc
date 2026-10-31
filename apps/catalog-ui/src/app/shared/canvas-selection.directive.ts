import { afterRenderEffect, DestroyRef, Directive, ElementRef, inject, input, signal } from '@angular/core';

export interface CanvasSelectionItem {
  id: string; x: number; y: number;
  minX?: number; minY?: number; maxX?: number; maxY?: number;
}
export interface CanvasSelectionAdapter {
  context(): unknown;
  items(): readonly CanvasSelectionItem[];
  enabled(): boolean;
  scale?(): {x: number; y: number};
  begin(): unknown;
  move(items: readonly CanvasSelectionItem[]): void;
  finish(): void;
  cancel(snapshot: unknown): void;
  accepts?(items: readonly CanvasSelectionItem[]): boolean;
}
interface Gesture {
  pointerId: number; mode: 'select' | 'move'; start: {x:number;y:number};
  items: readonly CanvasSelectionItem[]; previous: ReadonlySet<string>; additive: boolean;
  moved: boolean; snapshot?: unknown; scale: {x:number;y:number};
}

/** A screen-space marquee with world-space, transactional group movement. */
@Directive({selector:'[dacaCanvasSelection]', standalone:true})
export class CanvasSelectionDirective {
  readonly adapter=input.required<CanvasSelectionAdapter>({alias:'dacaCanvasSelection'});
  readonly selected=signal<ReadonlySet<string>>(new Set());
  private readonly root=inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private gesture:Gesture|null=null;
  private frame:HTMLDivElement|null=null;
  private suppressClick=false;
  private readonly decorations=new Map<HTMLElement,{outline:string;offset:string;animation:string}>();

  constructor(){
    let context:unknown;
    afterRenderEffect(()=>{
      const adapter=this.adapter(),next=adapter.context(),items=adapter.items();
      // The owner has already loaded another scope; never restore its old snapshot into that scope.
      if(next!==context){context=next;this.release();this.selected.set(new Set());}
      const available=new Set(items.map(item=>item.id)),selection=this.selected();
      if([...selection].some(id=>!available.has(id)))this.selected.set(new Set([...selection].filter(id=>available.has(id))));
      this.decorate();
    });
    const listen=(target:EventTarget,name:string,handler:(event:any)=>void)=>{
      target.addEventListener(name,handler,{capture:true,passive:false});
      inject(DestroyRef).onDestroy(()=>target.removeEventListener(name,handler,true));
    };
    listen(this.root,'pointerdown',(event:PointerEvent)=>this.down(event));
    listen(document,'pointermove',(event:PointerEvent)=>this.move(event));
    listen(document,'pointerup',(event:PointerEvent)=>this.up(event));
    listen(document,'pointercancel',(event:PointerEvent)=>{if(this.gesture?.pointerId===event.pointerId){this.consume(event);this.abort();}});
    listen(document,'keydown',(event:KeyboardEvent)=>this.key(event));
    listen(this.root,'click',(event:MouseEvent)=>{if(this.suppressClick&&event.detail>0){this.suppressClick=false;this.consume(event);}});
    inject(DestroyRef).onDestroy(()=>{this.abort();this.restoreDecorations();});
  }
  private consume(event:Event):void{event.preventDefault();event.stopImmediatePropagation();}
  private objects():HTMLElement[]{return [...this.root.querySelectorAll<HTMLElement>('[data-canvas-object]')];}
  private decorate():void{
    this.restoreDecorations();
    for(const element of this.objects())if(this.selected().has(element.dataset['canvasObject']!)){
      this.decorations.set(element,{outline:element.style.outline,offset:element.style.outlineOffset,animation:element.style.animationPlayState});
      element.dataset['canvasSelected']='true';element.style.outline='3px solid var(--daca-blue, #176783)';element.style.outlineOffset='3px';element.style.animationPlayState='paused';
    }
  }
  private restoreDecorations():void{
    for(const [element,style] of this.decorations){delete element.dataset['canvasSelected'];element.style.outline=style.outline;element.style.outlineOffset=style.offset;element.style.animationPlayState=style.animation;}
    this.decorations.clear();
  }
  private scale():{x:number;y:number}{const rect=this.root.getBoundingClientRect();return this.adapter().scale?.()??{x:rect.width/this.root.offsetWidth||1,y:rect.height/this.root.offsetHeight||1};}
  private point(event:PointerEvent,scale=this.gesture?.scale??this.scale()):{x:number;y:number}{const rect=this.root.getBoundingClientRect();return{x:(event.clientX-rect.left)/scale.x,y:(event.clientY-rect.top)/scale.y};}
  private down(event:PointerEvent):void{
    if(event.button!==0||event.isPrimary===false||this.gesture)return;
    this.suppressClick=false;
    const target=event.target as Element,object=target.closest<HTMLElement>('[data-canvas-object]');
    if(object&&!this.root.contains(object))return;
    const interactive=target.closest('button,a,input,select,textarea,[role=button]');
    if(interactive&&interactive!==object)return;
    const adapter=this.adapter(),items=adapter.items(),id=object?.dataset['canvasObject'];
    if(object&&!items.some(item=>item.id===id))return;
    if(id&&(event.shiftKey||event.ctrlKey||event.metaKey)){
      this.consume(event);this.suppressClick=true;const selection=new Set(this.selected());selection.has(id)?selection.delete(id):selection.add(id);this.selected.set(selection);return;
    }
    if(id&&(!this.selected().has(id)||this.selected().size<2)){
      if(!this.selected().has(id))this.selected.set(new Set());return;
    }
    if(id&&!adapter.enabled())return;
    if(!id&&target.closest('svg [role=button],.edge-hit,.edge-label,input,select,textarea'))return;
    const previous=this.selected(),scale=this.scale();
    this.consume(event);this.root.focus({preventScroll:true});
    this.gesture={pointerId:event.pointerId,mode:id?'move':'select',start:this.point(event,scale),items:items.filter(item=>previous.has(item.id)),previous,additive:event.shiftKey||event.ctrlKey||event.metaKey,moved:false,scale};
    if(!id&&!this.gesture.additive)this.selected.set(new Set());
    try{this.root.setPointerCapture(event.pointerId);}catch{/* Synthetic events have no active pointer. */}
  }
  private move(event:PointerEvent):void{
    const gesture=this.gesture;if(!gesture||gesture.pointerId!==event.pointerId)return;
    this.consume(event);const point=this.point(event),dx=point.x-gesture.start.x,dy=point.y-gesture.start.y;
    if(!gesture.moved&&Math.hypot(dx*gesture.scale.x,dy*gesture.scale.y)<4)return;
    if(!gesture.moved){gesture.moved=true;if(gesture.mode==='move')gesture.snapshot=this.adapter().begin();}
    if(gesture.mode==='select'){
      const left=Math.min(gesture.start.x,point.x),top=Math.min(gesture.start.y,point.y),right=Math.max(gesture.start.x,point.x),bottom=Math.max(gesture.start.y,point.y);
      if(!this.frame){this.frame=document.createElement('div');this.frame.dataset['canvasMarquee']='true';this.frame.setAttribute('aria-hidden','true');Object.assign(this.frame.style,{position:'absolute',pointerEvents:'none',zIndex:'20',boxSizing:'border-box',border:'2px solid #efa000',background:'rgba(255,185,35,.18)'});this.root.append(this.frame);}
      Object.assign(this.frame.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});
      const origin=this.root.getBoundingClientRect(),selection=new Set(gesture.additive?gesture.previous:[]),available=new Set(this.adapter().items().map(item=>item.id));
      for(const object of this.objects()){
        const rect=object.getBoundingClientRect();
        if(rect.width&&rect.height&&available.has(object.dataset['canvasObject']!)&&(rect.left-origin.left)/gesture.scale.x>=left&&(rect.right-origin.left)/gesture.scale.x<=right&&(rect.top-origin.top)/gesture.scale.y>=top&&(rect.bottom-origin.top)/gesture.scale.y<=bottom)selection.add(object.dataset['canvasObject']!);
      }
      this.selected.set(selection);
    }else if(this.adapter().enabled())this.translate(gesture.items,dx,dy);
    else this.abort();
  }
  private translate(items:readonly CanvasSelectionItem[],dx:number,dy:number):void{
    if(!items.length)return;
    dx=Math.max(Math.max(...items.map(item=>(item.minX??15)-item.x)),Math.min(Math.min(...items.map(item=>(item.maxX??100000)-item.x)),dx));
    dy=Math.max(Math.max(...items.map(item=>(item.minY??15)-item.y)),Math.min(Math.min(...items.map(item=>(item.maxY??100000)-item.y)),dy));
    const next=items.map(item=>({...item,x:item.x+dx,y:item.y+dy}));
    if(this.adapter().accepts?.(next)!==false)this.adapter().move(next);
  }
  private up(event:PointerEvent):void{
    const gesture=this.gesture;if(!gesture||gesture.pointerId!==event.pointerId)return;
    this.consume(event);if(gesture.moved&&gesture.mode==='move')this.adapter().finish();
    this.suppressClick=gesture.moved;this.release();
  }
  private release():void{const gesture=this.gesture;this.gesture=null;this.frame?.remove();this.frame=null;try{if(gesture)this.root.releasePointerCapture(gesture.pointerId);}catch{}}
  private abort():void{const gesture=this.gesture;if(gesture)this.suppressClick=true;if(gesture?.moved&&gesture.mode==='move')this.adapter().cancel(gesture.snapshot);if(gesture?.mode==='select')this.selected.set(gesture.previous);this.release();}
  private key(event:KeyboardEvent):void{
    const inside=this.root.contains(event.target as Node);if(!inside&&!this.gesture)return;
    const target=event.target instanceof Element?event.target:this.root,dialog=target.closest('[role=dialog],[role=menu]');
    if(target.closest('input,select,textarea,[contenteditable=true]')||(dialog&&this.root.contains(dialog)))return;
    if(event.key==='Escape'&&(this.gesture||this.selected().size)){
      this.consume(event);if(this.gesture)this.abort();else this.selected.set(new Set());return;
    }
    if(!inside)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){this.consume(event);this.selected.set(new Set(this.adapter().items().map(item=>item.id)));return;}
    const delta=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[event.key];
    if(delta&&this.selected().size>1&&this.adapter().enabled()&&!event.ctrlKey&&!event.metaKey&&!event.altKey){this.consume(event);const items=this.adapter().items().filter(item=>this.selected().has(item.id)),step=event.shiftKey?40:10;this.adapter().begin();this.translate(items,delta[0]*step,delta[1]*step);this.adapter().finish();}
  }
}

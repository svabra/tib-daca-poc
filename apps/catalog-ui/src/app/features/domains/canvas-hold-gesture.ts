import { signal } from '@angular/core';

/** A quick drag moves a card; holding first starts a connection. */
export class CanvasHoldGesture {
  readonly active=signal<{id:string;pointerId:number;clientX:number;clientY:number}|null>(null);
  private pending:{id:string;pointerId:number;clientX:number;clientY:number;originX:number;originY:number;timer:ReturnType<typeof setTimeout>}|null=null;
  start(id:string,event:PointerEvent):void{
    this.cancel();const {pointerId,clientX,clientY}=event;
    const timer=setTimeout(()=>{const pending=this.pending;if(pending?.pointerId===pointerId){this.active.set({id,pointerId,clientX:pending.clientX,clientY:pending.clientY});this.pending=null;}},180);
    this.pending={id,pointerId,clientX,clientY,originX:clientX,originY:clientY,timer};
  }
  move(event:PointerEvent):boolean{
    const active=this.active();if(active?.pointerId===event.pointerId){this.active.set({...active,clientX:event.clientX,clientY:event.clientY});return true;}
    const pending=this.pending;
    if(pending?.pointerId===event.pointerId){
      // Ignore normal hand jitter while deciding between a hold and a card drag.
      // Consume it so the card cannot move underneath the pending connection.
      if(Math.hypot(event.clientX-pending.originX,event.clientY-pending.originY)<=8){pending.clientX=event.clientX;pending.clientY=event.clientY;return true;}
      this.cancel();
    }
    return false;
  }
  finish(event:PointerEvent):ReturnType<CanvasHoldGesture['active']>{
    const active=this.active();if(active?.pointerId!==event.pointerId){if(this.pending?.pointerId===event.pointerId)this.cancel();return null;}
    this.cancel();return{...active,clientX:event.clientX,clientY:event.clientY};
  }
  cancel():void{if(this.pending)clearTimeout(this.pending.timer);this.pending=null;this.active.set(null);}
}

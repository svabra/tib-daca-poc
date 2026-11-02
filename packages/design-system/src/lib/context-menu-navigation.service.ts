import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';

/** Context menus use native links; Control only reveals their new-tab affordance. */
@Injectable({providedIn:'root'})
export class ContextMenuNavigationService {
  constructor(){
    const document=inject(DOCUMENT),window=document.defaultView;
    if(!window)return;
    const update=(event:KeyboardEvent|PointerEvent)=>document.documentElement.classList.toggle('daca-control-held',event.ctrlKey);
    const clear=()=>document.documentElement.classList.remove('daca-control-held');
    const visibility=()=>{if(document.visibilityState!=='visible')clear();};
    // Capture also observes keys consumed by a menu's own keyboard navigation.
    document.addEventListener('keydown',update,true);
    document.addEventListener('keyup',update,true);
    document.addEventListener('pointermove',update,{capture:true,passive:true});
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('blur',clear);
    inject(DestroyRef).onDestroy(()=>{
      document.removeEventListener('keydown',update,true);
      document.removeEventListener('keyup',update,true);
      document.removeEventListener('pointermove',update,true);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('blur',clear);clear();
    });
  }
}

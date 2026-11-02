import { TestBed } from '@angular/core/testing';
import { ContextMenuNavigationService } from '../../../../packages/design-system/src/lib/context-menu-navigation.service';

describe('Context menu Control modifier',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('observes consumed menu keys without interfering with local actions',()=>{
    TestBed.inject(ContextMenuNavigationService);
    const menu=document.createElement('button');document.body.append(menu);
    menu.addEventListener('keydown',event=>event.stopPropagation());
    menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Control',ctrlKey:true,bubbles:true}));
    expect(document.documentElement.classList.contains('daca-control-held')).toBe(true);
    const click=new MouseEvent('click',{ctrlKey:true,cancelable:true,bubbles:true});
    menu.dispatchEvent(click);expect(click.defaultPrevented).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keyup',{key:'Control',ctrlKey:false,bubbles:true}));
    expect(document.documentElement.classList.contains('daca-control-held')).toBe(false);
    menu.remove();
  });
  it('clears stale Control state on blur and removes its listeners on destruction',()=>{
    TestBed.inject(ContextMenuNavigationService);
    document.dispatchEvent(new KeyboardEvent('keydown',{ctrlKey:true}));
    window.dispatchEvent(new Event('blur'));
    expect(document.documentElement.classList.contains('daca-control-held')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown',{metaKey:true}));
    expect(document.documentElement.classList.contains('daca-control-held')).toBe(false);
    TestBed.resetTestingModule();
    document.dispatchEvent(new KeyboardEvent('keydown',{ctrlKey:true}));
    expect(document.documentElement.classList.contains('daca-control-held')).toBe(false);
  });
});

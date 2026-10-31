import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TooltipDirective } from '../shared/tooltip.directive';

@Component({standalone:true,imports:[TooltipDirective],template:'<p tabindex="0" aria-describedby="existing" dacaTooltip="Fachlicher Bereich">Beschreibung</p>'})
class TooltipHost {}

@Component({standalone:true,imports:[TooltipDirective],template:'<button dacaTooltip="Objekt" [dacaTooltipContent]="summary">Karte</button><ng-template #summary><a href="/products/test/overview" target="_blank" rel="noopener">Objekt öffnen</a></ng-template>'})
class InteractiveTooltipHost {}

describe('shared catalog tooltip',()=>{
  afterEach(()=>TestBed.resetTestingModule());
  it('uses the glossary appearance on hover/focus and closes for dragging, Escape and destruction',()=>{
    const fixture=TestBed.createComponent(TooltipHost);fixture.detectChanges();
    const trigger=fixture.nativeElement.querySelector('p') as HTMLElement;
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip=document.querySelector('.daca-glossary-tooltip[role="tooltip"]')!;
    expect(tooltip.textContent).toBe('Fachlicher Bereich');
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    trigger.dispatchEvent(new MouseEvent('pointerdown'));
    expect(document.contains(tooltip)).toBe(false);expect(trigger.getAttribute('aria-describedby')).toBe('existing');
    trigger.dispatchEvent(new FocusEvent('focusin'));expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(document.querySelector('[role="tooltip"]')).toBeNull();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));fixture.destroy();expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
  it('keeps canvas tooltips inside the native fullscreen surface',()=>{
    const fixture=TestBed.createComponent(TooltipHost);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const previous=Object.getOwnPropertyDescriptor(document,'fullscreenElement');
    Object.defineProperty(document,'fullscreenElement',{configurable:true,value:root});
    try {
      root.querySelector('p')!.dispatchEvent(new MouseEvent('mouseenter'));
      expect(root.querySelector('[role="tooltip"]')).not.toBeNull();
    } finally {fixture.destroy();if(previous)Object.defineProperty(document,'fullscreenElement',previous);else Reflect.deleteProperty(document,'fullscreenElement');}
  });
  it('lets the pointer cross the gap into an interactive summary and cleans up on scrolling',()=>{
    vi.useFakeTimers();
    try {
      const fixture=TestBed.createComponent(InteractiveTooltipHost);fixture.detectChanges();
      const trigger=fixture.nativeElement.querySelector('button') as HTMLElement;
      trigger.dispatchEvent(new MouseEvent('mouseenter'));
      const tooltip=document.querySelector<HTMLElement>('.daca-glossary-tooltip[role="dialog"]')!;
      trigger.dispatchEvent(new MouseEvent('mouseleave'));vi.advanceTimersByTime(100);
      tooltip.dispatchEvent(new MouseEvent('mouseenter'));vi.advanceTimersByTime(200);
      expect(document.contains(tooltip)).toBe(true);
      expect(tooltip.querySelector('a')?.target).toBe('_blank');
      document.dispatchEvent(new Event('scroll'));
      expect(document.contains(tooltip)).toBe(false);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    } finally {vi.useRealTimers();}
  });
  it('keeps a focused plain tooltip through automatic scrolling and closes when its trigger leaves the viewport',()=>{
    const fixture=TestBed.createComponent(TooltipHost);fixture.detectChanges();
    const trigger=fixture.nativeElement.querySelector('p') as HTMLElement;
    trigger.tabIndex=0;
    const bounds=vi.spyOn(trigger,'getBoundingClientRect').mockReturnValue({left:30,right:110,top:100,bottom:120,width:80,height:20,x:30,y:100,toJSON:()=>({})});
    trigger.focus();
    const tooltip=document.querySelector<HTMLElement>('.daca-glossary-tooltip[role="tooltip"]')!;
    document.dispatchEvent(new Event('scroll'));
    expect(document.contains(tooltip)).toBe(true);
    bounds.mockReturnValue({left:30,right:110,top:-40,bottom:-20,width:80,height:20,x:30,y:-40,toJSON:()=>({})});
    document.dispatchEvent(new Event('scroll'));
    expect(document.contains(tooltip)).toBe(false);
    expect(trigger.getAttribute('aria-describedby')).toBe('existing');
  });

  it('keeps a focused summary anchored when keyboard focus scrolls its card into view',()=>{
    const fixture=TestBed.createComponent(InteractiveTooltipHost);fixture.detectChanges();
    const trigger=fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    vi.spyOn(trigger,'getBoundingClientRect').mockReturnValue({left:30,right:290,top:100,bottom:240,width:260,height:140,x:30,y:100,toJSON:()=>({})});
    trigger.focus();
    const tooltip=document.querySelector<HTMLElement>('.daca-glossary-tooltip[role="dialog"]')!;
    document.dispatchEvent(new Event('scroll'));
    expect(document.contains(tooltip)).toBe(true);
    tooltip.querySelector('a')!.dispatchEvent(new Event('scroll',{bubbles:true}));
    expect(document.contains(tooltip)).toBe(true);
  });
});

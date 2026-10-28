import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TooltipDirective } from '../shared/tooltip.directive';

@Component({standalone:true,imports:[TooltipDirective],template:'<p tabindex="0" aria-describedby="existing" dacaTooltip="Fachlicher Bereich">Beschreibung</p>'})
class TooltipHost {}

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
});

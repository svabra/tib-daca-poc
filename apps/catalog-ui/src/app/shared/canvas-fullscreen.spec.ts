import { CanvasFullscreen } from './canvas-fullscreen';

describe('CanvasFullscreen',()=>{
  let root:HTMLElement,trigger:HTMLButtonElement,view:CanvasFullscreen,native:Element|null;
  const originalElement=Object.getOwnPropertyDescriptor(document,'fullscreenElement');
  const originalEnabled=Object.getOwnPropertyDescriptor(document,'fullscreenEnabled');
  const originalExit=Object.getOwnPropertyDescriptor(document,'exitFullscreen');
  beforeEach(()=>{
    root=document.createElement('section');trigger=document.createElement('button');root.append(trigger);document.body.append(root);
    native=null;document.body.style.overflow='auto';
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>native});
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
    Object.defineProperty(document,'exitFullscreen',{configurable:true,value:vi.fn(async()=>{native=null;})});
    view=new CanvasFullscreen(()=>root);
  });
  afterEach(()=>{
    view.destroy();root.remove();document.body.style.overflow='';
    for(const [key,descriptor] of [['fullscreenElement',originalElement],['fullscreenEnabled',originalEnabled],['exitFullscreen',originalExit]] as const){
      if(descriptor)Object.defineProperty(document,key,descriptor);else Reflect.deleteProperty(document,key);
    }
    vi.restoreAllMocks();
  });
  it('supports denied native fullscreen and restores scrolling and focus on exit',async()=>{
    root.requestFullscreen=vi.fn().mockRejectedValue(new Error('denied'));
    await view.toggle(trigger);expect(view.active()).toBe(true);expect(document.body.style.overflow).toBe('hidden');
    await view.exit();expect(view.active()).toBe(false);expect(document.body.style.overflow).toBe('auto');expect(document.activeElement).toBe(trigger);
  });
  it('restores the viewport even when native exit rejects',async()=>{
    root.requestFullscreen=vi.fn(async()=>{native=root;});
    await view.toggle(trigger);
    vi.mocked(document.exitFullscreen).mockRejectedValueOnce(new Error('exit failed'));
    await view.exit();expect(view.active()).toBe(false);expect(document.body.style.overflow).toBe('auto');expect(document.activeElement).toBe(trigger);
  });
  it('handles browser Escape and destruction without leaving a scroll lock',async()=>{
    root.requestFullscreen=vi.fn(async()=>{native=root;});
    await view.toggle(trigger);native=null;view.changed();
    expect(view.active()).toBe(false);expect(document.body.style.overflow).toBe('auto');
    await view.toggle(trigger);view.destroy();expect(view.active()).toBe(false);expect(document.body.style.overflow).toBe('auto');
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
  });
  it('cancels a late native entry after the user has already exited',async()=>{
    let finish!:()=>void;
    root.requestFullscreen=vi.fn(()=>new Promise<void>(resolve=>{finish=()=>{native=root;resolve();};}));
    const entering=view.toggle(trigger);await view.exit();finish();await entering;
    expect(native).toBeNull();expect(view.active()).toBe(false);expect(document.body.style.overflow).toBe('auto');
  });
  it('wraps keyboard focus while keeping the text-alternative summary reachable',async()=>{
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent='Beziehungen als Text';details.append(summary);root.append(details);
    for(const element of [trigger,summary])vi.spyOn(element,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    root.addEventListener('keydown',event=>view.trapTab(event));
    await view.toggle(trigger);summary.focus();
    summary.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(trigger);
    trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(summary);
  });
});

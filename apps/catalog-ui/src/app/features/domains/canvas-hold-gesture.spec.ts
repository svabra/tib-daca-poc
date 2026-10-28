import { CanvasHoldGesture } from './canvas-hold-gesture';

describe('CanvasHoldGesture',()=>{
  beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
  const event=(x=20,y=30)=>({pointerId:1,clientX:x,clientY:y}) as PointerEvent;
  it('turns a stationary hold into a connection and keeps its last pointer location',()=>{
    const hold=new CanvasHoldGesture();hold.start('term:a',event());vi.advanceTimersByTime(179);expect(hold.active()).toBeNull();vi.advanceTimersByTime(1);expect(hold.active()?.id).toBe('term:a');
    expect(hold.move(event(300,240))).toBe(true);expect(hold.finish(event(320,260))).toEqual({id:'term:a',pointerId:1,clientX:320,clientY:260});expect(hold.active()).toBeNull();
  });
  it('leaves a quick drag as card movement and cancels interrupted holds',()=>{
    const hold=new CanvasHoldGesture();hold.start('domain:a',event());expect(hold.move(event(50,60))).toBe(false);vi.advanceTimersByTime(400);expect(hold.active()).toBeNull();
    hold.start('domain:b',event());hold.cancel();vi.advanceTimersByTime(400);expect(hold.active()).toBeNull();
  });
  it('absorbs hand jitter without moving the card or cancelling the hold',()=>{
    const hold=new CanvasHoldGesture();hold.start('domain:a',event());
    vi.advanceTimersByTime(80);expect(hold.move(event(25,33))).toBe(true);
    vi.advanceTimersByTime(100);expect(hold.active()).toEqual({id:'domain:a',pointerId:1,clientX:25,clientY:33});
    hold.cancel();
  });
  it('measures slop from the original press rather than from each tiny movement',()=>{
    const hold=new CanvasHoldGesture();hold.start('domain:a',event());
    expect(hold.move(event(24,30))).toBe(true);expect(hold.move(event(28,30))).toBe(true);
    expect(hold.move(event(29,30))).toBe(false);vi.advanceTimersByTime(180);expect(hold.active()).toBeNull();
  });
});

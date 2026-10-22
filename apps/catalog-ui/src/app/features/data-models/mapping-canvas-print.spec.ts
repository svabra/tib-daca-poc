import { printMappingCanvas } from './mapping-canvas-print';

describe('mapping canvas printing', () => {
  afterEach(() => { document.querySelectorAll('.mapping-print-frame').forEach((frame) => frame.remove()); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('prints the full graph with federal branding, distinct model/print dates and a safe title on one sheet', async () => {
    vi.useFakeTimers({toFake:['Date']});
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    const canvas = document.createElement('div');
    canvas.className = 'graph-canvas';
    canvas.innerHTML = '<svg><path d="M 10 20 L 400 20" /></svg><section class="physical-representation" style="left:1800px;top:1400px">S3 object</section>';
    Object.defineProperty(canvas, 'scrollWidth', { value: 2100 });
    Object.defineProperty(canvas, 'scrollHeight', { value: 1600 });
    document.body.append(canvas);
    const append = document.body.append.bind(document.body);
    let printWindow: Window | null = null;
    const print = vi.fn();
    vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
      append(...nodes);
      const frame = nodes.find((node) => node instanceof HTMLIFrameElement) as HTMLIFrameElement;
      if (frame) { printWindow = frame.contentWindow; printWindow!.print = print; printWindow!.focus = vi.fn(); }
    });
    try {
      await printMappingCanvas(canvas, 'Vehicle <script>title</script>', {modelUpdatedAt:'2026-09-05T09:10:00Z',modelRevision:3});
      const frame = document.querySelector<HTMLIFrameElement>('.mapping-print-frame')!;
      const output = frame.contentDocument!;
      expect(print).toHaveBeenCalledOnce();
      expect(output.querySelector('h1')?.textContent).toBe('Vehicle <script>title</script>');
      expect(output.querySelector('script')).toBeNull();
      const logo = output.querySelector<HTMLImageElement>('.canvas-print-header img')!;
      expect(logo.src).toContain('/assets/swiss-confederation-logo.png');
      expect(logo.width).toBe(132);
      expect(output.querySelector('.canvas-print-identity strong')?.textContent).toBe('Datenkatalog');
      expect(output.querySelector('.canvas-print-identity small')?.textContent).toBe('Data Platform BIT');
      const dates = output.querySelectorAll<HTMLTimeElement>('.canvas-print-meta time');
      expect(dates[0].dateTime).toBe('2026-09-05T09:10:00.000Z');
      expect(dates[0].textContent).toBe('05.09.2026, 11:10');
      expect(dates[1].dateTime).toBe('2026-10-21T10:00:00.000Z');
      expect(dates[1].textContent).toBe('21.10.2026, 12:00');
      expect(output.querySelector('.canvas-print-meta')?.textContent).toContain('Version 3');
      expect(output.querySelectorAll('.graph-canvas')).toHaveLength(1);
      expect(output.querySelector('.physical-representation')?.textContent).toBe('S3 object');
      expect(output.querySelector('.graph-scroll,.canvas-tools,.mapping-side')).toBeNull();
      const printed = output.querySelector<HTMLElement>('.graph-canvas')!;
      expect(printed.style.width).toBe('2100px');
      expect(printed.style.height).toBe('1600px');
      const scale = Number(printed.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
      expect(scale).toBeGreaterThan(0);
      expect(scale * 2100).toBeLessThanOrEqual(1040);
      expect(scale * 1600).toBeLessThanOrEqual(714);
      expect(canvas.style.transform).toBe('');
      printWindow!.dispatchEvent(new Event('afterprint'));
      expect(document.querySelector('.mapping-print-frame')).toBeNull();
    } finally { canvas.remove(); }
  });
});

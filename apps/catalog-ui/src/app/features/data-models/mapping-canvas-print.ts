export interface MappingCanvasPrintMetadata {
  modelUpdatedAt: string;
  modelRevision: number;
}

/** Print a complete canvas without changing the editor's scroll, layout or draft state. */
export async function printMappingCanvas(canvas: HTMLElement, title: string, metadata: MappingCanvasPrintMetadata): Promise<void> {
  const source = canvas.ownerDocument;
  const frame = source.createElement('iframe');
  frame.className = 'mapping-print-frame';
  frame.title = 'Druckansicht des Mapping-Canvas';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:100%;bottom:0;width:1123px;height:794px;border:0;pointer-events:none';
  source.body.append(frame);
  const printDocument = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!printDocument || !printWindow) { frame.remove(); throw new Error('Print document unavailable'); }
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => { clearTimeout(cleanupTimer); frame.remove(); };
  try {
    printDocument.documentElement.lang = source.documentElement.lang || 'de';
    printDocument.title = title;
    const base = printDocument.createElement('base');
    base.href = source.baseURI;
    printDocument.head.append(base);
    // Retain Angular's scoped styles, custom properties, fonts and endpoint pseudo-elements.
    const stylesLoaded: Promise<void>[] = [];
    for (const element of source.head.querySelectorAll('style,link[rel="stylesheet"]')) {
      const clone = element.cloneNode(true) as HTMLElement;
      if (clone.tagName === 'LINK') stylesLoaded.push(new Promise((resolve, reject) => {
        clone.onload = () => resolve();
        clone.onerror = () => reject(new Error('Print stylesheet unavailable'));
      }));
      printDocument.head.append(clone);
    }
    const style = printDocument.createElement('style');
    style.textContent = `
      @page { size: A4 landscape; margin: 10mm; }
      html,body { min-width:0!important; min-height:0!important; height:auto!important; margin:0!important; padding:0!important; background:#fff!important; }
      body { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      h1 { margin:0 0 6px; font:600 16px/1.4 "Noto Sans",Arial,sans-serif; color:#14202b; }
      .canvas-print-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin:0 0 14px; }
      .canvas-print-logo { display:block; width:132px; height:auto; }
      .canvas-print-identity { display:flex; flex-direction:column; text-align:right; color:#14202b; font:600 16px/1.3 "Noto Sans",Arial,sans-serif; }
      .canvas-print-identity small { margin-top:3px; font-size:11px; font-weight:400; }
      .canvas-print-meta { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 20px; margin:0 0 14px; color:#44515c; font:400 10px/1.4 "Noto Sans",Arial,sans-serif; }
      .canvas-print-page { width:1040px; min-height:0!important; break-inside:avoid; }
      .canvas-print-viewport { position:relative; overflow:hidden; }
      .graph-canvas { min-width:0!important; min-height:0!important; margin:0!important; transform-origin:top left; }
      .logical-node,.physical-representation { box-shadow:none!important; outline:none!important; }
      button { cursor:default!important; }
    `;
    printDocument.head.append(style);
    const page = printDocument.createElement('main');
    page.className = 'canvas-print-page';
    const header = printDocument.createElement('header');
    header.className = 'canvas-print-header';
    const logo = printDocument.createElement('img');
    logo.className = 'canvas-print-logo';
    logo.src = new URL('/assets/swiss-confederation-logo.png', source.baseURI).href;
    logo.alt = 'Schweizerische Eidgenossenschaft - Bundesverwaltung';
    logo.width = 132;
    const identity = printDocument.createElement('div');
    identity.className = 'canvas-print-identity';
    const catalogLabel = printDocument.createElement('strong');
    catalogLabel.textContent = 'Datenkatalog';
    const platformLabel = printDocument.createElement('small');
    platformLabel.textContent = 'Data Platform BIT';
    identity.append(catalogLabel, platformLabel);
    header.append(logo, identity);
    const details = printDocument.createElement('p');
    details.className = 'canvas-print-meta';
    const dateFormat = new Intl.DateTimeFormat('de-CH', {dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Zurich'});
    const addDate = (label: string, date: Date, suffix = '') => {
      const item = printDocument.createElement('span');
      item.append(`${label}: `);
      if (Number.isFinite(date.getTime())) {
        const time = printDocument.createElement('time');
        time.dateTime = date.toISOString();
        time.textContent = dateFormat.format(date);
        item.append(time);
      } else item.append('nicht verfügbar');
      item.append(suffix);
      details.append(item);
    };
    addDate('Modellstand', new Date(metadata.modelUpdatedAt), ` · Version ${metadata.modelRevision}`);
    addDate('Druckdatum', new Date());
    const heading = printDocument.createElement('h1');
    heading.textContent = title;
    const viewport = printDocument.createElement('div');
    viewport.className = 'canvas-print-viewport';
    const copy = canvas.cloneNode(true) as HTMLElement;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(bounds.width, canvas.scrollWidth, 570);
    const height = Math.max(bounds.height, canvas.scrollHeight, 380);
    // Fit both dimensions onto one landscape sheet; no scroll container clips the graph.
    const fit = () => {
      const headerHeight = Math.ceil(viewport.getBoundingClientRect().top - page.getBoundingClientRect().top);
      const scale = Math.min(1, 1040 / width, Math.max(1, 714 - headerHeight) / height);
      viewport.style.width = `${width * scale}px`;
      viewport.style.height = `${height * scale}px`;
      copy.style.transform = `scale(${scale})`;
    };
    copy.style.position = 'absolute';
    copy.style.left = '0';
    copy.style.top = '0';
    copy.style.width = `${width}px`;
    copy.style.height = `${height}px`;
    copy.querySelectorAll('.edge-hit,.edge-handles').forEach((element)=>element.remove());
    copy.querySelectorAll('.is-hovered').forEach((element)=>element.classList.remove('is-hovered'));
    copy.querySelectorAll('[tabindex]').forEach((element) => element.removeAttribute('tabindex'));
    viewport.append(copy);
    page.append(header, heading, details, viewport);
    printDocument.body.replaceChildren(page);
    await Promise.all(stylesLoaded);
    await printDocument.fonts?.ready;
    await logo.decode?.();
    await Promise.all([...copy.querySelectorAll('img')].map((img) => img.decode?.().catch(() => {})));
    fit();
    printWindow.addEventListener('afterprint', cleanup, { once: true });
    // Browsers that omit afterprint must not retain the detached print document indefinitely.
    cleanupTimer = setTimeout(cleanup, 120_000);
    printWindow.focus();
    printWindow.print();
  } catch (error) { cleanup(); throw error; }
}

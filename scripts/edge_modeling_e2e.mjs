#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = (args.get('--base-url') ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const edgePath = args.get('--edge-path')
  ?? process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const remotePort = Number(args.get('--remote-debugging-port') ?? 9400 + Math.floor(Math.random() * 400));
const screenshotDirectory = args.get('--screenshot-dir');
const profileDirectory = await mkdtemp(path.join(tmpdir(), 'daca-edge-e2e-'));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class CdpClient {
  constructor(webSocketUrl) {
    this.sequence = 0;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('close', () => {for(const pending of this.pending.values())pending.reject(new Error('Browser connection closed'));this.pending.clear();});
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
  }

  async call(method, params = {}, sessionId = undefined) {
    await this.ready;
    const id = ++this.sequence;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method}: browser command timed out`));},30_000);
      this.pending.set(id, { method, resolve:(value)=>{clearTimeout(timer);resolve(value);}, reject:(error)=>{clearTimeout(timer);reject(error);} });
      this.socket.send(JSON.stringify(message));
    });
  }
}

async function connectBrowser() {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json/version`);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`Microsoft Edge DevTools did not become ready: ${lastError ?? 'timeout'}`);
}

const edge = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-default-apps',
  '--no-first-run',
  `--remote-debugging-port=${remotePort}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${profileDirectory}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

let cdp;
let sessionId;

async function evaluate(expression) {
  const response = await cdp.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text
      ?? 'Browser evaluation failed');
  }
  return response.result?.value;
}

async function waitFor(expression, message, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error(`${message}${lastError ? ` (${lastError.message})` : ''}`);
}

async function setViewport(width, height) {
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    screenWidth: width,
    screenHeight: height,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
}

async function captureScreenshot(filename) {
  if (!screenshotDirectory) return;
  const targetDirectory = path.resolve(screenshotDirectory);
  await mkdir(targetDirectory, { recursive: true });
  const result = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  }, sessionId);
  await writeFile(path.join(targetDirectory, filename), Buffer.from(result.data, 'base64'));
}

async function capturePageSegmentScreenshot(selector, filename, width = 1440, height = 900) {
  if (!screenshotDirectory) return;
  const targetDirectory = path.resolve(screenshotDirectory);
  await mkdir(targetDirectory, { recursive: true });
  const rect = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    return { x: 0, y: bounds.top + window.scrollY, width: ${width}, height: ${height} };
  })()`);
  invariant(rect, `Screenshot target ${selector} was unavailable`);
  const result = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { ...rect, scale: 1 },
  }, sessionId);
  await writeFile(path.join(targetDirectory, filename), Buffer.from(result.data, 'base64'));
}

async function captureCanvasPrintPdf() {
  if (!screenshotDirectory) return;
  const html=await evaluate("document.querySelector('.mapping-print-frame').contentDocument.documentElement.outerHTML");
  const {targetId}=await cdp.call('Target.createTarget',{url:'about:blank'});
  try {
    const {sessionId:printSession}=await cdp.call('Target.attachToTarget',{targetId,flatten:true});
    await cdp.call('Page.enable',{},printSession);
    const {frameTree}=await cdp.call('Page.getFrameTree',{},printSession);
    await cdp.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html},printSession);
    await cdp.call('Runtime.evaluate',{expression:"new Promise((resolve)=>{if(document.readyState==='complete')resolve();else window.addEventListener('load',resolve,{once:true});}).then(()=>document.fonts.ready)",awaitPromise:true},printSession);
    const {data}=await cdp.call('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false},printSession);
    const pdf=Buffer.from(data,'base64');
    invariant((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)??[]).length===1,'canvas print did not fit on one page');
    await writeFile(path.join(path.resolve(screenshotDirectory),'mapping-canvas-print.pdf'),pdf);
  } finally { await cdp.call('Target.closeTarget',{targetId}); }
}

async function captureWorkspaceScreenshot(filename) {
  if (!screenshotDirectory) return;
  const targetScroll = await evaluate(`(() => {
    const workspace = document.querySelector('.mapping-shell');
    if (!workspace) return -1;
    const top = Math.max(0, workspace.getBoundingClientRect().top + window.scrollY - 8);
    window.scrollTo(0, top);
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
    return window.scrollY;
  })()`);
  invariant(targetScroll >= 0, 'mapping workspace was unavailable for the focused QA capture');
  await sleep(150);
  await captureScreenshot(filename);
}

async function navigate(route, actor, width = 1440, height = 900) {
  const url = new URL(route, `${baseUrl}/`);
  if (actor) url.searchParams.set('demoUser', actor);
  await setViewport(width, height);
  await cdp.call('Page.bringToFront', {}, sessionId);
  await cdp.call('Page.navigate', { url: url.href }, sessionId);
  await waitFor(
    "document.readyState === 'complete' && document.querySelector('daca-root') !== null",
    `Angular page did not load: ${url.href}`,
  );
  await waitFor(
    "!document.body.innerText.includes('werden geladen') && !document.body.innerText.includes('wird geladen')",
    `Angular page remained in a loading state: ${url.href}`,
  );
  await evaluate("document.fonts?.ready ?? Promise.resolve()");
}

async function api(actor, route, { method = 'GET', etag = null, body = undefined } = {}) {
  const request = { actor, route, method, etag, body };
  return evaluate(`(async () => {
    const request = ${JSON.stringify(request)};
    const headers = {'X-DaCa-User': request.actor};
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    if (request.etag) headers['If-Match'] = request.etag;
    const response = await fetch(request.route, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    const text = await response.text();
    let responseBody = text;
    try { responseBody = text ? JSON.parse(text) : null; } catch {}
    return {
      status: response.status,
      body: responseBody,
      headers: Object.fromEntries(response.headers.entries()),
    };
  })()`);
}

function expectStatus(response, expected, step) {
  invariant(
    response.status === expected,
    `${step}: expected HTTP ${expected}, received ${response.status}: ${JSON.stringify(response.body)}`,
  );
  return response;
}

async function setControls(values) {
  const missing = await evaluate(`(() => {
    const values = ${JSON.stringify(values)};
    const missing = [];
    for (const [selector, value] of Object.entries(values)) {
      const element = document.querySelector(selector);
      if (!element) { missing.push(selector); continue; }
      element.value = value;
      element.dispatchEvent(new Event('input', {bubbles: true}));
      element.dispatchEvent(new Event('change', {bubbles: true}));
    }
    return missing;
  })()`);
  invariant(missing.length === 0, `Missing form controls: ${missing.join(', ')}`);
}

async function clickText(selector, text) {
  const clicked = await evaluate(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((element) => element.textContent.trim().includes(${JSON.stringify(text)}));
    if (!target || target.disabled) return false;
    target.click();
    return true;
  })()`);
  invariant(clicked, `Could not activate ${selector} containing “${text}”`);
}

async function pressKey(key, code, windowsVirtualKeyCode) {
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
  await cdp.call('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key, code, windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    ...(text ? { text, unmodifiedText: text } : {}),
  }, sessionId);
  if (text) {
    await cdp.call('Input.dispatchKeyEvent', {
      type: 'char', key, code, windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
      text, unmodifiedText: text,
    }, sessionId);
  }
  await cdp.call('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  }, sessionId);
}

async function csvPhysicalModelsFlow() {
  const suppliedFile = args.get('--csv-file');
  const actor = suppliedFile ? 'mirjam.keller' : 'christian.spider';
  const file = suppliedFile ? path.resolve(suppliedFile) : path.join(profileDirectory, 'Gebaeude-QA.csv');
  if (!suppliedFile) {
    const rows = [
      ['Datenobjekt','Tabelle','Feldname','Datentyp','Länge','Kurzbeschreibung','Kommentar','System','Klassifizierung','Dezimalstellen','Werteliste'],
      ['Gebäude','VIBDBU','SGENR','CHAR','8',`CSV QA ${Date.now()}`,'','SAP','','',''],
      ['Gebäude','VIBDBU','RGEBART','NUMC','2','Gebäudeart','','SAP','','','Gebäudeart'],
      ['Gebäude','VIBDBU','VALIDFROM','DATS','10','Gültig ab','','SAP','','',''],
      ['Gebäude','Gebäude / Bauwerke','Name','IfcLabel','','Gebäude ID; "Beispiel"\nZweite Zeile','','BIM','Projektabhängig','',''],
      ['Gebäude','Gebäude / Bauwerke','Name','IfcLabel','','Zweite Beschreibung','','BIM','Projektabhängig','',''],
      ['Gebäude','VIBDOBJASS','','','','Objekt','','SAP','','',''],
      ['Gebäude','OWNER.RADON','YEAR','Integer','4','Baujahr','','ImmoGIS','Datensatzabhängig','10',''],
    ];
    const quote = value => /[;"\r\n]/.test(value) ? '"' + value.replaceAll('"','""') + '"' : value;
    await writeFile(file, Buffer.from(rows.map(row => row.map(quote).join(';')).join('\r\r\n'), 'latin1'));
  }
  await navigate('/models', actor);
  await waitFor("document.querySelector('.csv-import-trigger') && !document.querySelector('.csv-import-trigger').disabled", 'CSV loader entry missing');
  const largePreview = await evaluate(`(async()=>{
    const csv='Tabelle;Feldname;Datentyp;Kurzbeschreibung\\n'+Array.from({length:200},(_,i)=>'QA;FIELD_'+i+';CHAR;'+ 'x'.repeat(6000)).join('\\n');
    const response=await fetch('/api/v1/physical-model-csv/preview',{method:'POST',headers:{'Content-Type':'application/json','X-DaCa-User':${JSON.stringify(actor)}},body:JSON.stringify({contentBase64:btoa(csv)})});
    const body=await response.json();return {status:response.status,fieldCount:body.fieldCount};
  })()`);
  invariant(largePreview.status===200 && largePreview.fieldCount===200, 'CSV upload proxy rejected a valid inventory above 1 MiB');
  const contentBase64 = (await readFile(file)).toString('base64');
  const expected = expectStatus(await api(actor, '/api/v1/physical-model-csv/preview', {method:'POST', body:{contentBase64}}), 200, 'CSV preflight').body;
  invariant(expected.tableCount === (suppliedFile ? 31 : 4) && expected.fieldCount === (suppliedFile ? 267 : 5), 'CSV table/field inventory changed unexpectedly');
  const initialSources = expectStatus(await api(actor, '/api/v1/physical-sources'), 200, 'source list before preview').body.items.length;
  let sourceId;
  async function selectFile() {
    await waitFor("document.querySelector('.csv-import-trigger') && !document.querySelector('.csv-import-trigger').disabled", 'CSV loader entry not ready after navigation');
    await clickText('.csv-import-trigger', 'CSV');
    await waitFor("document.querySelector('daca-physical-csv-import dialog')?.open", 'CSV dialog did not open');
    if (!suppliedFile) await setControls({'daca-physical-csv-import .import-inputs select':'vbs-verteidigung'});
    const {root} = await cdp.call('DOM.getDocument', {}, sessionId);
    const {nodeId} = await cdp.call('DOM.querySelector', {nodeId: root.nodeId, selector:'daca-physical-csv-import input[type=file]'}, sessionId);
    await cdp.call('DOM.setFileInputFiles', {nodeId, files:[file]}, sessionId);
    await waitFor(`document.querySelector('.preview-count')?.textContent.includes('${expected.tableCount} physische Modelle')`, 'CSV preview did not load');
  }
  try {
    await selectFile();
    await pressKey('Escape','Escape',27);
    await waitFor("!document.querySelector('daca-physical-csv-import dialog')?.open && document.activeElement?.classList.contains('csv-import-trigger')", 'Escape did not cancel CSV preview and restore focus');
    invariant(expectStatus(await api(actor, '/api/v1/physical-sources'), 200, 'source list after cancel').body.items.length === initialSources, 'CSV cancellation persisted a source');
    await selectFile();
    invariant(await evaluate("document.querySelector('.import-warnings')?.innerText.includes('doppeltes Feld')"), 'Duplicate field explanation missing');
    await setControls({'daca-physical-csv-import input[type=search]':'SAP'});
    await waitFor("[...document.querySelectorAll('.table-list button small')].every(e=>e.textContent==='SAP')", 'CSV table search did not filter by system');
    await setControls({'daca-physical-csv-import input[type=search]':''});
    await clickText('.table-list button', 'Gebäude / Bauwerke');
    await waitFor("document.querySelector('.table-preview')?.innerText.includes('Projektabhängig')", 'Original CSV classification missing');
    await captureScreenshot('csv-models-preview.png');
    await setViewport(412,915);
    invariant(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'CSV dialog overflows the mobile page');
    await captureScreenshot('csv-models-preview-mobile.png');
    await setViewport(1440,900);
    await clickText('daca-physical-csv-import footer button', 'Importieren');
    await waitFor("location.pathname.startsWith('/physical-models/') && document.querySelector('daca-physical-object-detail h2')", 'CSV import did not immediately open physical models', 30000);
    sourceId = await evaluate("location.pathname.split('/').pop()");
    invariant(await evaluate(`document.querySelectorAll('.table-row').length===${expected.tableCount}`), 'Explorer did not show every imported physical model');
    invariant(await evaluate("[...document.querySelectorAll('.database-node>summary strong')].map(e=>e.textContent).sort().join(',')==='BIM,ImmoGIS,SAP'"), 'Source systems were flattened in the physical explorer');
    await clickText('.table-select', 'Gebäude / Bauwerke');
    await waitFor("document.querySelector('.csv-originals')?.innerText.includes('Name')", 'Persisted CSV originals unavailable');
    await evaluate("[...document.querySelectorAll('.csv-originals details')].find(e=>e.querySelector('summary')?.textContent.startsWith('Name ')).open=true");
    invariant(await evaluate("document.querySelector('.csv-originals')?.innerText.includes('Projektabhängig')"), 'Original metadata not inspectable after import');
    await capturePageSegmentScreenshot('.explorer-layout', 'csv-models-imported.png');
    const source = expectStatus(await api(actor, '/api/v1/physical-sources'), 200, 'persisted CSV source').body.items.find(item=>item.id===sourceId);
    invariant(source?.adapterType==='csv', 'Imported inventory masquerades as a live database');
    await navigate(`/physical-models/${sourceId}`, actor);
    await waitFor(`document.querySelectorAll('.table-row').length===${expected.tableCount}`, 'CSV models did not survive reload');
    await navigate('/models', actor); await selectFile();
    await clickText('daca-physical-csv-import footer button','Importieren');
    await waitFor(`location.pathname==='/physical-models/${sourceId}' && document.querySelector('daca-physical-object-detail h2')`, 'Identical CSV import was duplicated');
    invariant(await evaluate("document.body.innerText.includes('Vorhandener CSV-Import')"), 'Idempotent import did not explain reuse');
    console.log(`PASS csv-physical-models: ${expected.tableCount} tables / ${expected.fieldCount} fields @ ${sourceId}`);
  } finally {
    if (sourceId && !suppliedFile) {
      const sources=expectStatus(await api(actor,'/api/v1/physical-sources'),200,'find QA CSV source').body.items;
      const source=sources.find(item=>item.id===sourceId);
      if(source) expectStatus(await api(actor,`/api/v1/physical-sources/${sourceId}/retire`,{method:'POST',etag:`"${source.revision}"`}),200,'retire only the QA CSV source');
    }
  }
}

async function logicalFirstFlow() {
  const title = `Edge QA Mitarbeitende ${Date.now()}`;
  await navigate('/models/new', 'cinthya.thor');
  await waitFor(
    "document.querySelector('input[formcontrolname=\"titleDe\"]') !== null",
    'logical-model editor did not finish loading',
  );
  await waitFor(
    "[...document.querySelectorAll('button[type=\"submit\"]')].some((button) => button.textContent.includes('Als Entwurf speichern') && !button.disabled)",
    'logical-model editor did not receive the active modelling role',
  );
  await clickText('button[type="submit"]', 'Als Entwurf speichern');
  await waitFor(
    "document.querySelector('.save-action > button + .save-validation')?.textContent.includes('Titel (Deutsch)') && document.querySelector('.save-action > button + .save-validation')?.textContent.includes('Feld 1 – Feldname')",
    'logical-model validation summary was not rendered directly below save',
  );
  await waitFor(
    "getComputedStyle(document.querySelector('input[formcontrolname=\"titleDe\"]')).backgroundColor !== 'rgb(255, 255, 255)'",
    'invalid logical-model fields were not highlighted after saving',
  );
  const tooltipOpened = await evaluate(`(() => {
    const host = document.querySelector('[dacaFieldHelp="titleDe"]');
    const trigger = host?.querySelector('.daca-field-help-title');
    trigger?.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}));
    const tooltip = document.querySelector('[role="tooltip"].is-visible');
    return Boolean(trigger && tooltip?.textContent.includes('Titel (Deutsch)') && !host?.querySelector('.daca-field-help-trigger'));
  })()`);
  invariant(tooltipOpened, 'semantic field help tooltip did not open from the field title on hover');
  const reference = expectStatus(
    await api('cinthya.thor', '/api/v1/logical-models/70d964d8-334c-50bc-9177-88e3dbfba28f'),
    200,
    'load logical-first reference',
  ).body;
  await setControls({
    'input[formcontrolname="titleDe"]': title,
    'textarea[formcontrolname="descriptionDe"]': 'Browsergeprüftes logical-first Modell ohne Distribution, Produkt oder physische Quelle.',
    'input[formcontrolname="identifiers"]': `EDGE-LOGICAL-${Date.now()}`,
    'select[formcontrolname="dataDomainId"]': reference.dataDomainId,
    'select[formcontrolname="classification"]': 'internal',
    'input[formcontrolname="entityName"]': 'edge_employee',
    '.field-list input[formcontrolname="name"]': 'employee_id',
    '.field-list textarea[formcontrolname="shortDescription"]': 'Stabiler synthetischer Identifikator.',
  });
  await waitFor(
    "document.querySelector('.review-owner-info')?.textContent.includes('Christian Spider') && document.querySelector('.review-owner-info')?.textContent.includes('Sibilla Micheli')",
    'domain-bound primary owner and deputy were not rendered',
  );
  const businessObjectsSelected = await evaluate(`(() => {
    const selects = [...document.querySelectorAll('.field-list select[formcontrolname="entityBusinessObjectVersionId"], .field-list select[formcontrolname="businessObjectVersionId"]')];
    for (const select of selects) {
      const option = [...select.options].find((item) => item.value);
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }
    return selects.length === 2;
  })()`);
  invariant(businessObjectsSelected, 'Versioned business objects were not available in the editor');
  if (screenshotDirectory) {
    await evaluate(`(() => {
      const form = document.querySelector('.model-editor-form');
      if (!form) return false;
      const top = Math.max(0, form.getBoundingClientRect().top + window.scrollY - 8);
      window.scrollTo(0, top);
      document.documentElement.scrollTop = top;
      document.body.scrollTop = top;
      return true;
    })()`);
    await sleep(150);
    await captureScreenshot('logical-model-field-table-1440x900.png');
  }
  await clickText('button[type="submit"]', 'Als Entwurf speichern');
  await waitFor(
    `location.pathname.match(/^\\/models\\/[0-9a-f-]+$/) && document.body.innerText.includes(${JSON.stringify(title)})`,
    'logical-first draft was not persisted and routed to its detail page',
  );
  const modelId = await evaluate("location.pathname.split('/').pop()");
  const identifier = await evaluate("document.querySelector('input[formcontrolname=\"identifiers\"]')?.value");
  invariant(typeof identifier === 'string' && identifier.length > 0, 'saved logical model identifier was unavailable');
  const secretClassificationDisabled = await evaluate("document.querySelector('.classification-hero option[value=\"secret\"]')?.disabled === true");
  invariant(secretClassificationDisabled, 'secret classification is not visibly disabled');
  await navigate('/models/new', 'cinthya.thor');
  await waitFor(
    "document.querySelector('input[formcontrolname=\"titleDe\"]') !== null",
    'duplicate-identifier editor did not finish loading',
  );
  await waitFor(
    "[...document.querySelectorAll('.field-list select[formcontrolname=\"entityBusinessObjectVersionId\"], .field-list select[formcontrolname=\"businessObjectVersionId\"]')].length === 2 && [...document.querySelectorAll('.field-list select[formcontrolname=\"entityBusinessObjectVersionId\"], .field-list select[formcontrolname=\"businessObjectVersionId\"]')].every((select) => [...select.options].some((option) => option.value))",
    'duplicate-identifier business objects did not finish loading',
  );
  await waitFor(
    `Array.from(document.querySelector('select[formcontrolname="dataDomainId"]')?.options ?? []).some((option) => option.value === ${JSON.stringify(reference.dataDomainId)})`,
    'duplicate-identifier domain options did not finish loading',
  );
  await setControls({
    'input[formcontrolname="titleDe"]': `Duplicate ID ${Date.now()}`,
    'textarea[formcontrolname="descriptionDe"]': 'Browser test for a structured duplicate identifier error.',
    'input[formcontrolname="identifiers"]': identifier,
    'select[formcontrolname="dataDomainId"]': reference.dataDomainId,
    'select[formcontrolname="classification"]': 'internal',
    'input[formcontrolname="entityName"]': 'duplicate_record',
    '.field-list input[formcontrolname="name"]': 'duplicate_id',
    '.field-list textarea[formcontrolname="shortDescription"]': 'Browser test for conflict feedback.',
  });
  const duplicateObjectsSelected = await evaluate(`(() => {
    const selects = [...document.querySelectorAll('.field-list select[formcontrolname="entityBusinessObjectVersionId"], .field-list select[formcontrolname="businessObjectVersionId"]')];
    for (const select of selects) {
      const option = [...select.options].find((item) => item.value);
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }
    return selects.length === 2;
  })()`);
  invariant(duplicateObjectsSelected, 'duplicate-identifier test has no versioned business objects');
  await clickText('button[type="submit"]', 'Als Entwurf speichern');
  await waitFor(
    "document.querySelector('.save-problem, .save-validation') !== null",
    'duplicate identifier did not display save feedback',
  );
  const duplicateFeedback = await evaluate("document.querySelector('.save-problem, .save-validation')?.textContent ?? ''");
  invariant(
    duplicateFeedback.includes('Identifier bereits vergeben')
      && duplicateFeedback.includes('DACA-LM-IDENTIFIER-DUPLICATE')
      && !duplicateFeedback.includes('The requested change conflicts'),
    `duplicate identifier did not display a structured, user-facing error: ${duplicateFeedback}`,
  );
  await waitFor(
    "document.querySelector('input[formcontrolname=\"identifiers\"]')?.classList.contains('ng-invalid')",
    'duplicate identifier input was not marked invalid',
  );
  await navigate(`/models/${modelId}`, 'cinthya.thor');
  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(title)}) && document.body.innerText.includes('Alle Änderungen gespeichert')`,
    'persisted logical-model draft did not survive a reload',
  );
  await clickText('button', 'Zur Domänenfreigabe einreichen');
  await waitFor(
    "document.body.innerText.includes('Der Prüfauftrag wurde an')",
    'logical-first review submission did not complete',
  );
  const submitted = expectStatus(
    await api('cinthya.thor', `/api/v1/logical-models/${modelId}`),
    200,
    'read submitted logical model',
  ).body;
  invariant(submitted.conceptIds.length === 0, 'Optional model-level I14Y concepts were unexpectedly required or persisted');
  const submittedFields = submitted.entities.flatMap((entity) => entity.fields);
  invariant(submittedFields.every((field) => field.conceptIds.length === 0 && field.primaryConceptId === null && field.valueListConceptId === null), 'Logical model did not persist correctly without optional field-level I14Y concepts');
  const removedDirectPublish = await api(
    'cinthya.thor',
    `/api/v1/logical-models/${modelId}/versions/${submitted.versionId}/publish`,
    { method: 'POST', etag: `"${submitted.lockVersion}"` },
  );
  invariant(removedDirectPublish.status === 404, `Removed direct publish endpoint returned ${removedDirectPublish.status}`);

  await navigate('/tasks', 'sibilla.micheli');
  const deputyReceivedTask = await evaluate(`document.body.innerText.includes(${JSON.stringify(title)})`);
  invariant(!deputyReceivedTask, 'Deputy unexpectedly received the personal logical-model review task');

  await navigate('/tasks', 'christian.spider');
  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(title)}) && [...document.querySelectorAll('a')].some((item) => item.textContent.includes('Aufgabe öffnen'))`,
    'Domain Owner did not receive the personal logical-model review task',
  );
  const reviewTaskOpened = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.owner-task-card')].find((item) => item.textContent.includes(${JSON.stringify(title)}));
    const link = [...(card?.querySelectorAll('a') ?? [])].find((item) => item.textContent.includes('Aufgabe öffnen'));
    link?.click();
    return Boolean(link);
  })()`);
  invariant(reviewTaskOpened, 'Owner review task could not be opened');
  await waitFor(
    "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Annehmen und publizieren') && !item.disabled)",
    'logical-model review workspace did not expose the owner decision',
  );
  await clickText('button', 'Annehmen und publizieren');
  await waitFor(
    "document.body.innerText.includes('angenommen und publiziert')",
    'Domain Owner acceptance did not complete',
  );
  const published = expectStatus(
    await api('christian.spider', `/api/v1/logical-models/${modelId}`),
    200,
    'read published logical model',
  ).body;
  invariant(published.status === 'published', `Expected published model, received ${published.status}`);
  invariant(published.distributions.length === 0, 'Logical-first model unexpectedly has a distribution');
  invariant(published.dataServices.length === 0, 'Logical-first model unexpectedly has a data service');
  return { modelId, title };
}

async function dataModelJourneyTen() {
  const domains = expectStatus(await api('mirjam.keller', '/api/v1/domains'), 200, 'list domains for journey 10').body;
  const domainRows = Array.isArray(domains) ? domains : domains.items;
  const domain = domainRows.find((item) => (item.preferredLabel ?? '').includes('Immobilienmanagement VBS'));
  invariant(domain, 'Journey 10 domain is missing');
  const businessObjects = expectStatus(
    await api('mirjam.keller', `/api/v1/terminology/terms?conceptKind=business_object&domainId=${domain.id}`),
    200,
    'list journey 10 business objects',
  ).body.items;
  invariant(businessObjects.length >= 3, 'Journey 10 business-object terminology is incomplete');
  const [property, need] = businessObjects;
  const identifier = `AR-IMM-${Date.now()}`;
  const write = {
    identifiers: [identifier],
    localizations: [
      {language: 'de', title: 'Immobilienportfolio VBS', description: 'Portfolio der Immobilienobjekte und Infrastrukturbedarfe des VBS.'},
      {language: 'fr', title: 'Portefeuille immobilier DDPS', description: 'Portefeuille des objets immobiliers et des besoins en infrastructures du DDPS.'},
      {language: 'it', title: 'Portafoglio immobiliare DDPS', description: 'Portafoglio degli oggetti immobiliari e delle esigenze infrastrutturali del DDPS.'},
      {language: 'en', title: 'DDPS real estate portfolio', description: 'Portfolio of DDPS real estate assets and infrastructure requirements.'},
    ],
    dataOwnerUserId: 'daniel.wenger', deputyOwnerUserId: 'eliane.rossi',
    creator: {type: 'InternalPerson', userId: 'mirjam.keller'}, dataDomainId: domain.id,
    organizationUnitId: 'vbs-armasuisse-immobilien', dataClassification: 'unclassified',
    dateCreated: new Date().toISOString().slice(0, 10),
    contactPoints: [{name: 'Mirjam Keller', email: 'mirjam.keller@ar.admin.ch'}],
    publisher: {name: 'armasuisse Immobilien', identifier: '20053180', uri: 'https://ld.admin.ch/office/20053180'},
    accessRights: 'urn:daca:access-rights:unclassified', themes: [], conceptIds: [],
    entities: [{name: 'immobilienportfolio', businessObject: 'Immobilienobjekt', businessObjectVersionId: property.versionId, position: 1, comment: null,
      fields: [{name: 'infrastrukturbedarf', businessObject: 'Infrastrukturbedarf', businessObjectVersionId: need.versionId, dataType: 'xsd:string', shortDescription: 'Versionierter Infrastrukturbedarf.', classification: 'unclassified', nullable: true, minCount: 0, maxCount: 1, position: 1, conceptIds: [], primaryConceptId: null, valueListConceptId: null}],
    }], distributions: [], dataServices: [], assistanceProvenance: [],
  };
  let modelResponse = expectStatus(await api('mirjam.keller', '/api/v1/logical-models', {method: 'POST', body: write}), 201, 'create journey 10 model');
  let model = modelResponse.body;
  let submitted = expectStatus(await api('mirjam.keller', `/api/v1/logical-models/${model.id}/versions/${model.versionId}/submit`, {method: 'POST', etag: modelResponse.headers.etag}), 200, 'submit journey 10 model');
  const missingComment = await api('daniel.wenger', `/api/v1/logical-model-reviews/${submitted.body.reviewId}/decision`, {method: 'POST', etag: submitted.headers.etag, body: {decision: 'reject'}});
  invariant(missingComment.status === 422, `Journey 10 rejection without comment returned ${missingComment.status}`);
  let rejected = expectStatus(await api('daniel.wenger', `/api/v1/logical-model-reviews/${submitted.body.reviewId}/decision`, {method: 'POST', etag: submitted.headers.etag, body: {decision: 'reject', comment: 'Definition fachlich präzisieren.'}}), 200, 'reject journey 10 model');
  invariant(rejected.body.status === 'changes_requested', 'Journey 10 rejection did not create changes_requested');
  write.comment = 'Definition gemäss Review präzisiert.';
  modelResponse = expectStatus(await api('mirjam.keller', `/api/v1/logical-models/${model.id}/versions/${rejected.body.versionId}`, {method: 'PUT', etag: rejected.headers.etag, body: write}), 200, 'correct journey 10 model');
  submitted = expectStatus(await api('mirjam.keller', `/api/v1/logical-models/${model.id}/versions/${modelResponse.body.versionId}/submit`, {method: 'POST', etag: modelResponse.headers.etag}), 200, 'resubmit journey 10 model');
  const accepted = expectStatus(await api('daniel.wenger', `/api/v1/logical-model-reviews/${submitted.body.reviewId}/decision`, {method: 'POST', etag: submitted.headers.etag, body: {decision: 'accept'}}), 200, 'accept journey 10 model');
  invariant(accepted.body.status === 'published', 'Journey 10 acceptance did not publish the model');
  await navigate(`/models/${model.id}`, 'daniel.wenger', 1440, 900);
  await waitFor("document.body.innerText.includes('Immobilienportfolio VBS')", 'Journey 10 published model did not render');
  await captureScreenshot('journey-10-data-model-1440x900.png');
  return {modelId: model.id};
}

async function legacyPhysicalFirstFlow() {
  const sourceName = `Edge Fixture ${Date.now()}`;
  const createdSource = expectStatus(await api('christian.man', '/api/v1/physical-sources', {
    method: 'POST',
    body: {
      name: sourceName,
      description: 'Ephemere E2E-Quelle mit ausschließlich technischen Fixture-Metadaten.',
      adapterType: 'fixture',
      configRef: 'fixture.edge-e2e',
      departmentCode: 'VBS',
      organizationId: 'vbs-verteidigung',
    },
  }), 201, 'create physical-first fixture source').body;

  await navigate('/physical-models', 'christian.man');
  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(sourceName)})`,
    'new physical source did not appear in Edge',
  );
  const imported = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(sourceName)}));
    const button = card?.querySelector('button');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  invariant(imported, 'physical source import action was unavailable');
  await waitFor(
    "document.body.innerText.includes('Keine Drift erkannt')",
    'baseline physical import did not complete',
  );
  const snapshots = expectStatus(
    await api('christian.man', `/api/v1/physical-snapshots?sourceId=${createdSource.id}`),
    200,
    'list imported physical snapshots',
  ).body.items;
  invariant(snapshots.length === 1, `Expected one physical-first snapshot, received ${snapshots.length}`);
  const snapshotId = snapshots[0].id;
  const snapshot = expectStatus(
    await api('christian.man', `/api/v1/physical-snapshots/${snapshotId}`),
    200,
    'read physical-first snapshot',
  ).body;
  const vehicleTable = snapshot.databases
    .flatMap((database) => database.schemas)
    .flatMap((schema) => schema.tables)
    .find((table) => table.name === 'vehicle_inventory');
  invariant(vehicleTable, 'Fixture snapshot is missing logistics.vehicle_inventory');

  const opened = await evaluate(`(() => {
    const table = [...document.querySelectorAll('.table-node')]
      .find((item) => item.textContent.includes('logistics.vehicle_inventory'));
    const button = table?.querySelector('button');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  invariant(opened, 'physical-first derivation dialog did not open');
  await waitFor("document.querySelector('.derive-dialog[open]') !== null", 'derivation dialog is not open');
  const vehicleReference = expectStatus(
    await api('christian.man', '/api/v1/logical-models/83cb48b4-32b4-5bc9-b613-1036c3cb2e77'),
    200,
    'load vehicle model domain reference',
  ).body;
  const title = `Edge Fahrzeugbestand ${Date.now()}`;
  await setControls({
    '.derive-dialog input[formcontrolname="title"]': title,
    '.derive-dialog select[formcontrolname="dataDomainId"]': vehicleReference.dataDomainId,
    '.derive-dialog select[formcontrolname="dataOwnerUserId"]': 'lawrence.hill',
    '.derive-dialog select[formcontrolname="deputyOwnerUserId"]': 'hong.an.captain',
  });
  await clickText('.derive-dialog button[type="submit"]', 'Feldvorschau laden');
  await waitFor("document.querySelector('.derive-preview') !== null", 'physical-first preview was not rendered');
  await setControls({
    '.derive-preview input[formcontrolname="name"]': 'edge_vehicle_id',
  });
  const conceptDecisionsRecorded = await evaluate(`(() => {
    const fields = [...document.querySelectorAll('.derive-preview fieldset')];
    for (const field of fields) {
      const selected = field.querySelector('input[formcontrolname="selected"]');
      const mode = field.querySelector('select[formcontrolname="conceptMode"]');
      if (!selected?.checked || !mode) continue;
      mode.value = 'none';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return fields.length > 0 && fields.every((field) => {
      const selected = field.querySelector('input[formcontrolname="selected"]');
      const mode = field.querySelector('select[formcontrolname="conceptMode"]');
      return !selected?.checked || mode?.value === 'none';
    });
  })()`);
  invariant(conceptDecisionsRecorded, 'physical-first preview requires an explicit concept decision per selected field');
  await waitFor(
    `(() => {
      const button = [...document.querySelectorAll('.derive-dialog button[type="submit"]')]
        .find((item) => item.textContent.includes('Mapping-Entw'));
      return Boolean(button && !button.disabled);
    })()`,
    'physical-first commit remained disabled after the concept decisions',
  );
  await clickText('.derive-dialog button[type="submit"]', 'Modell & Mapping-Entwürfe speichern');
  await waitFor(
    `location.pathname.match(/^\\/models\\/[0-9a-f-]+$/) && document.body.innerText.includes(${JSON.stringify(title)})`,
    'physical-first commit did not create a logical model',
  );
  const modelId = await evaluate("location.pathname.split('/').pop()");
  const mappings = expectStatus(
    await api('christian.man', `/api/v1/asset-mappings?logicalModelId=${modelId}`),
    200,
    'list physical-first mapping drafts',
  ).body.items;
  invariant(mappings.length === vehicleTable.columns.length, 'Initial mapping drafts do not cover every selected preview field');
  invariant(mappings.every((mapping) => mapping.status === 'draft'), 'Derived mappings must start as drafts');
  return { sourceId: createdSource.id, sourceName, snapshotId, modelId };
}

async function physicalFirstFlow() {
  const requestedSourceName = `Edge Fixture ${Date.now()}`;
  const createResponse = await api('christian.man', '/api/v1/physical-sources', {
    method: 'POST',
    body: {
      name: requestedSourceName,
      description: 'Ephemere E2E-Quelle mit ausschliesslich technischen Fixture-Metadaten.',
      adapterType: 'fixture',
      configRef: 'fixture.edge-e2e',
      departmentCode: 'VBS',
      organizationId: 'vbs-verteidigung',
    },
  });
  let createdSource;
  if (createResponse.status === 201) {
    createdSource = createResponse.body;
  } else {
    invariant(createResponse.status === 409, `create physical-first fixture source: expected HTTP 201 or 409, received ${createResponse.status}: ${JSON.stringify(createResponse.body)}`);
    const activeSources = expectStatus(
      await api('christian.man', '/api/v1/physical-sources'),
      200,
      'list existing physical-first system instances',
    ).body.items;
    createdSource = activeSources.find((source) => (
      source.adapterType === 'fixture' && source.name.startsWith('Edge Fixture ')
    ));
    invariant(createdSource, 'existing Edge fixture system instance was not returned after duplicate rejection');
  }
  const sourceName = createdSource.name;
  expectStatus(await api('christian.man', `/api/v1/physical-sources/${createdSource.id}/imports`, {
    method: 'POST',
    etag: `"${createdSource.revision}"`,
    body: { fixtureVariant: 'baseline' },
  }), 200, 'reset the single physical-first fixture instance to baseline');

  await navigate('/models', 'christian.man');
  await waitFor(
    "[...document.querySelectorAll('.models-actions button')].some((button) => button.textContent.includes('Neues logisches Modell') && !button.disabled)",
    'model creation action did not receive the active modelling role',
  );
  await clickText('.models-actions button', 'Neues logisches Modell');
  await waitFor("document.querySelector('.creation-dialog[open]') !== null", 'model creation chooser did not open');
  await clickText('.creation-card', 'Aus bestehender Datenquelle ableiten');
  await waitFor(
    `location.pathname === '/physical-models' && document.body.innerText.includes(${JSON.stringify(sourceName)})`,
    'physical-first chooser did not open the source explorer',
  );
  const openedSource = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(sourceName)}));
    const link = [...(row?.querySelectorAll('a') ?? [])]
      .find((item) => item.textContent.includes('Quelle öffnen'));
    link?.click();
    return Boolean(link);
  })()`);
  invariant(openedSource, 'physical source could not be opened from the source register');
  await waitFor(
    "location.pathname.startsWith('/physical-models/') && document.querySelector('.object-tree') !== null",
    'physical source explorer did not open',
  );
  const snapshots = expectStatus(
    await api('christian.man', `/api/v1/physical-snapshots?sourceId=${createdSource.id}`),
    200,
    'list imported physical snapshots',
  ).body.items;
  invariant(snapshots.length >= 1, 'physical-first system instance has no baseline snapshot');
  const snapshotId = snapshots.reduce((latest, snapshot) => snapshot.sequence > latest.sequence ? snapshot : latest).id;
  const snapshot = expectStatus(
    await api('christian.man', `/api/v1/physical-snapshots/${snapshotId}`),
    200,
    'read physical-first snapshot',
  ).body;
  const vehicleTable = snapshot.databases
    .flatMap((database) => database.schemas)
    .flatMap((schema) => schema.tables)
    .find((table) => table.name === 'vehicle_inventory');
  invariant(vehicleTable, 'Fixture snapshot is missing logistics.vehicle_inventory');

  await waitFor(
    "[...document.querySelectorAll('.object-tree button')].some((item) => item.textContent.includes('vehicle_inventory'))",
    'vehicle_inventory did not appear in the object hierarchy',
  );
  const selectedObject = await evaluate(`(() => {
    const object = [...document.querySelectorAll('.object-tree button')]
      .find((item) => item.textContent.includes('vehicle_inventory'));
    object?.click();
    return Boolean(object);
  })()`);
  invariant(selectedObject, 'vehicle_inventory could not be selected in the source explorer');
  await waitFor(
    "document.querySelector('.object-detail h2')?.textContent.includes('vehicle_inventory')",
    'selected physical object detail did not render',
  );
  await capturePageSegmentScreenshot('.explorer-layout', 'physical-explorer-1440x900.png');
  const openedMenu = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.table-row')]
      .find((item) => item.textContent.includes('vehicle_inventory'));
    row?.querySelector('.table-actions-button')?.click();
    return Boolean(row);
  })()`);
  invariant(openedMenu, 'table context menu could not be opened');
  await capturePageSegmentScreenshot('.explorer-layout', 'physical-table-menu-1440x900.png');
  await clickText('.context-menu button', 'Logisches Modell ableiten');
  await waitFor(
    "location.pathname.match(/^\\/models\\/[0-9a-f-]+\\/mappings$/) && document.body.innerText.includes('Vehicle Inventory')",
    'direct physical-first derivation did not open the mapping workspace',
  );
  const modelId = await evaluate("location.pathname.split('/')[2]");
  let mappings = expectStatus(
    await api('christian.man', `/api/v1/asset-mappings?logicalModelId=${modelId}`),
    200,
    'list initial physical-first mapping drafts',
  ).body.items;
  invariant(mappings.length === vehicleTable.columns.length, 'Initial mapping drafts do not cover every derived field');
  invariant(mappings.every((mapping) => mapping.status === 'draft'), 'Derived mappings must start as drafts');

  await waitFor(
    "document.querySelector('.graph-canvas') !== null",
    'mapping workspace representation action did not finish rendering',
  );

  await waitFor(
    "document.querySelector('.mapping-side .field-panel-form')?.textContent.includes('Feldmerkmale') && document.querySelector('.mapping-side input[formcontrolname=\"name\"]')?.value.length > 0 && document.querySelector('.mapping-side select[formcontrolname=\"dataType\"]')",
    'shared editable field characteristics panel did not open beside the mapping',
  );
  const selectedLogicalField = await evaluate(`(() => {
    const field = document.querySelector('.mapping-graph .field-endpoint');
    field?.click();
    return Boolean(field);
  })()`);
  invariant(selectedLogicalField, 'logical field could not be selected in the graph');
  try {
    await waitFor(
      "document.activeElement?.matches('.field-panel-form input[formcontrolname=\"entityName\"]') === true",
      'selecting a logical graph field did not focus the first field characteristic',
    );
  } catch (error) {
    const context = await evaluate(`(() => ({
      active: document.activeElement?.outerHTML.slice(0, 300),
      firstInput: document.querySelector('.field-panel-form input[formcontrolname="entityName"]')?.outerHTML.slice(0, 300),
      editor: document.querySelector('.mapping-side')?.innerText.slice(0, 500),
    }))()`);
    throw new Error(`${error.message}: ${JSON.stringify(context)}`);
  }
  await capturePageSegmentScreenshot('.mapping-shell', 'physical-derived-form-1440x900.png');

  const mappingPath = await evaluate('location.pathname');
  await evaluate(`document.querySelector('.graph-canvas').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true, clientX:200, clientY:300}))`);
  await waitFor("document.querySelector('.canvas-context-menu') !== null", 'canvas context menu did not open');
  await clickText('.canvas-context-menu button', 'Neue physische Repräsentation');
  await waitFor("document.querySelector('.representation-dialog[open]') !== null", 'representation dialog did not open');
  await clickText('.representation-dialog footer button', 'Abbrechen');
  invariant(await evaluate('location.pathname') === mappingPath, 'cancel left the mapping workspace');
  await evaluate(`document.querySelector('.logical-node>header').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:300}))`);
  await clickText('.canvas-context-menu button', 'Neue physische Repräsentation');
  await waitFor("[...document.querySelectorAll('.source-options button')].some((item)=>item.textContent.includes('DAAIF S3 Parquet'))", 'S3 source not visible in picker');
  await clickText('.source-options button', 'DAAIF S3 Parquet');
  await waitFor("[...document.querySelectorAll('.representation-dialog .object-tree button')].some((item)=>item.textContent.includes('vehicle_inventory_mapping_demo.parquet'))", 'Parquet demo not visible in picker');
  await clickText('.representation-dialog .object-tree button', 'vehicle_inventory_mapping_demo.parquet');
  await waitFor("document.querySelector('.representation-dialog .object-detail')?.textContent.includes('VEHICLE_ID')", 'Parquet field inspection did not render');
  invariant(await evaluate("document.querySelector('.representation-dialog .object-facts').textContent.includes('Parquet-Footer')"), 'Parquet footer row count label missing');
  await capturePageSegmentScreenshot('.representation-dialog', 'representation-picker-parquet-1440x900.png');
  await clickText('.representation-dialog footer button', 'Hinzufügen');
  await waitFor("document.querySelectorAll('.physical-representation').length >= 2", 'both representations did not appear together');
  invariant(await evaluate('location.pathname') === mappingPath, 'adding a representation left the canvas');
  invariant(await evaluate("document.querySelector('.suggestion-review')?.textContent.includes('eindeutige Namenspaare')"), 'automatic name match result missing');
  await waitFor("document.querySelector('.draft-save-action>button')?.disabled === false", 'accepted suggestions were not local drafts');
  invariant(await evaluate("document.querySelector('.draft-save-reason')===null"),'enabled draft save still displays a blocking reason');
  await clickText('.toolbar-actions button', 'Entwurf speichern');
  await waitFor("document.body.innerText.includes('Alle Mapping-Entwürfe wurden versioniert gespeichert')", 'second representation mappings were not persisted');
  mappings = expectStatus(
    await api('christian.man', `/api/v1/asset-mappings?logicalModelId=${modelId}`),
    200,
    'list mappings across both physical representations',
  ).body.items;
  invariant(new Set(mappings.map((mapping) => mapping.physicalSnapshotId)).size === 2, 'logical model is not linked to two physical representations');
  invariant(await evaluate("document.querySelectorAll('.representation-list > button').length >= 2"), 'mapping workspace does not list both physical representations');
  await navigate(mappingPath, 'christian.man');
  await waitFor("document.querySelectorAll('.physical-representation').length >= 2", 'saved representations did not survive reload');
  const saveHover=await evaluate(`(() => {
    const trigger=document.querySelector('.draft-save-action');trigger.scrollIntoView({block:'center',behavior:'instant'});
    const rect=trigger.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  })()`);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:saveHover.x,y:saveHover.y},sessionId);
  await waitFor("document.querySelector('.draft-save-reason')?.getBoundingClientRect().height>0",'disabled save reason did not appear on mouse hover');
  invariant(await evaluate("document.querySelector('.draft-save-reason').textContent.includes('Keine ungespeicherten Änderungen')"),'disabled save reason does not explain the lack of local changes');
  invariant(await evaluate("document.querySelector('.draft-save-action button').disabled"),'saved workspace unexpectedly enables save');
  await captureScreenshot('mapping-save-disabled-reason-1440x900.png');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2},sessionId);
  await evaluate("document.querySelector('.toolbar-actions>button').focus()");
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
  await waitFor("document.activeElement===document.querySelector('.draft-save-action')&&document.querySelector('.draft-save-reason')?.getBoundingClientRect().height>0",'disabled save reason is not keyboard accessible');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
  await waitFor("document.querySelector('.draft-save-reason')?.hidden===true",'Escape did not dismiss the save reason');
  await evaluate('document.activeElement.blur()');
  await capturePageSegmentScreenshot('.mapping-shell', 'mapping-multiple-representations-1440x900.png');
  invariant(await evaluate("document.querySelector('.add-representation') === null && ![...document.querySelectorAll('.representation-panel button')].some((button)=>button.textContent.includes('Neue physische Repräsentation'))"), 'redundant add-representation button is still present');
  const beforeDrag=await evaluate(`(() => {
    const card=[...document.querySelectorAll('.physical-representation')].find((item)=>item.textContent.includes('vehicle_inventory_mapping_demo.parquet'));
    const header=card.querySelector('header');header.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const rect=header.getBoundingClientRect();
    return {id:card.dataset.representationTableId,x:rect.left+70,y:rect.top+25,left:card.offsetLeft,top:card.offsetTop};
  })()`);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:beforeDrag.x,y:beforeDrag.y},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:beforeDrag.x,y:beforeDrag.y,button:'left',buttons:1,clickCount:1},sessionId);
  for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:beforeDrag.x+step*75,y:beforeDrag.y+step*20,buttons:1},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:beforeDrag.x+300,y:beforeDrag.y+80,button:'left',buttons:0,clickCount:1},sessionId);
  await waitFor(`(() => {const card=document.querySelector('[data-representation-table-id="${beforeDrag.id}"]');return Math.abs(card.offsetLeft-${beforeDrag.left+300})<2&&Math.abs(card.offsetTop-${beforeDrag.top+80})<2;})()`, 'representation did not move with pointer drag');
  invariant(await evaluate("document.querySelector('.representation-context-menu')===null"),'drag unexpectedly opened drawing actions');
  await waitFor(`(() => {
    const card=document.querySelector('[data-representation-table-id="${beforeDrag.id}"]'),column=card.querySelector('.column-endpoint'),canvas=document.querySelector('.graph-canvas');
    const path=canvas.querySelector('path[data-edge-physical-column-id="'+column.dataset.physicalColumnId+'"]');
    if(!path)return false;
    const numbers=path.getAttribute('d').match(/-?[0-9]+(?:[.][0-9]+)?/g).map(Number),r=column.getBoundingClientRect(),c=canvas.getBoundingClientRect();
    return Math.abs(numbers.at(-2)-(r.left-c.left-1))<2&&Math.abs(numbers.at(-1)-(r.top-c.top+r.height/2))<2;
  })()`, 'edges did not follow the moved representation');
  await evaluate("document.querySelector('.canvas-tools .fullscreen-toggle').click()");
  await waitFor("document.querySelector('.mapping-shell.is-fullscreen')?.getBoundingClientRect().height >= innerHeight-1",'fullscreen editor did not fill the viewport');
  await evaluate(`document.querySelector('.graph-canvas').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:250,clientY:250}))`);
  await clickText('.canvas-context-menu button','Neue physische Repräsentation');
  await waitFor("document.querySelector('.mapping-shell.is-fullscreen .representation-dialog[open]')!==null",'source picker is unavailable in fullscreen');
  await clickText('.representation-dialog footer button','Abbrechen');
  await capturePageSegmentScreenshot('.mapping-shell','mapping-editor-fullscreen-1440x900.png');
  await evaluate("document.querySelector('.canvas-tools .fullscreen-toggle').click()");
  await waitFor("document.querySelector('.mapping-shell.is-fullscreen')===null && document.body.style.overflow!=='hidden'",'fullscreen did not restore the page');
  invariant(await evaluate("document.querySelector('.toolbar-actions .fullscreen-toggle')===null"),'fullscreen control remains in the editor toolbar');
  const toolsBeforeScroll=await evaluate(`(() => {const scroll=document.querySelector('.graph-scroll'),tools=document.querySelector('.canvas-tools');scroll.scrollIntoView({block:'start',behavior:'instant'});const r=tools.getBoundingClientRect();scroll.scrollTop+=70;scroll.scrollLeft+=30;return {top:r.top,right:r.right};})()`);
  await waitFor(`(() => {const r=document.querySelector('.canvas-tools').getBoundingClientRect();return Math.abs(r.top-${toolsBeforeScroll.top})<1&&Math.abs(r.right-${toolsBeforeScroll.right})<1;})()`, 'canvas controls moved when scrolling the graph');
  await evaluate(`(() => {
    const logical=document.querySelector('.logical-node>header');
    for(let i=0;i<25;i++)logical.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true,cancelable:true}));
  })()`);
  await waitFor(`(() => {
    const canvas=document.querySelector('.graph-canvas'),card=[...canvas.querySelectorAll('.physical-representation')].find((item)=>item.dataset.representationTableId!=='${beforeDrag.id}'),column=card.querySelector('.column-endpoint');
    const path=canvas.querySelector('path[data-edge-physical-column-id="'+column.dataset.physicalColumnId+'"]');if(!path)return false;
    const field=canvas.querySelector('[data-logical-field-id="'+path.dataset.edgeLogicalFieldId+'"]'),numbers=path.getAttribute('d').match(/-?[0-9]+(?:[.][0-9]+)?/g).map(Number),c=canvas.getBoundingClientRect(),f=field.getBoundingClientRect(),p=column.getBoundingClientRect();
    return card.classList.contains('is-left-of-logical')&&field.classList.contains('has-left-port')&&Math.abs(numbers[0]-(f.left-c.left-1))<2&&Math.abs(numbers.at(-2)-(p.right-c.left+1))<2&&parseFloat(getComputedStyle(path).strokeWidth)<=1.5;
  })()`, 'left-side physical representation did not use facing logical and physical ports');
  await evaluate(`(() => {
    const append=document.body.append.bind(document.body);
    document.body.append=(...nodes)=>{append(...nodes);const frame=nodes.find((node)=>node instanceof HTMLIFrameElement&&node.classList.contains('mapping-print-frame'));if(frame){frame.contentWindow.print=()=>{window.__canvasPrintRequested=true;};document.body.append=append;}};
    document.querySelector('.canvas-print').click();
  })()`);
  await waitFor('window.__canvasPrintRequested===true', 'canvas print button did not request printing');
  invariant(await evaluate(`(() => {const d=document.querySelector('.mapping-print-frame').contentDocument;return d.querySelector('h1').textContent===document.querySelector('#mapping-graph-title').textContent&&d.querySelectorAll('.physical-representation').length===document.querySelectorAll('.physical-representation').length&&d.querySelector('.graph-canvas svg path')!==null&&d.querySelector('.canvas-tools,.mapping-side,.mapping-toolbar,.graph-scroll')===null;})()`), 'print output is missing the title or includes editor controls');
  const printModel=expectStatus(await api('christian.man',`/api/v1/logical-models/${modelId}`),200,'read printed model revision').body;
  invariant(await evaluate(`(() => {
    const d=document.querySelector('.mapping-print-frame').contentDocument,logo=d.querySelector('.canvas-print-header img'),identity=d.querySelector('.canvas-print-identity'),dates=d.querySelectorAll('.canvas-print-meta time');
    const header=logo.getBoundingClientRect(),right=identity.getBoundingClientRect();
    return logo.naturalWidth>0&&header.width<=132&&header.left<right.left&&right.right>d.body.clientWidth/2&&identity.querySelector('strong').textContent==='Datenkatalog'&&identity.querySelector('small').textContent==='Data Platform BIT'&&dates.length===2&&dates[0].dateTime===${JSON.stringify(new Date(printModel.updatedAt).toISOString())}&&d.querySelector('.canvas-print-meta').textContent.includes('Version ${printModel.revision}')&&Math.abs(Date.now()-Date.parse(dates[1].dateTime))<60000;
  })()`),'print branding, model revision or distinct print timestamp is missing');
  await captureCanvasPrintPdf();
  await evaluate(`(() => {const frame=document.querySelector('.mapping-print-frame');frame.style.cssText='position:fixed;left:0;top:0;width:1123px;height:794px;border:0;z-index:2000;background:white';})()`);
  await captureScreenshot('mapping-canvas-print-1440x900.png');
  await evaluate("document.querySelector('.mapping-print-frame').contentWindow.dispatchEvent(new Event('afterprint'))");
  await evaluate(`document.querySelector('[data-representation-table-id="${beforeDrag.id}"] .physical-table-title').click()`);
  await clickText('.representation-context-menu button','Darstellung der physischen Repräsentation entfernen');
  await waitFor(`document.querySelector('[data-representation-table-id="${beforeDrag.id}"]')===null`,'remove drawing did not hide its card');
  invariant(await evaluate("document.querySelector('.draft-save-action>button').disabled"),'removing a drawing dirtied persisted mappings');
  await evaluate(`document.querySelector('[data-representation-id="${beforeDrag.id}"]').click()`);
  await waitFor(`document.querySelector('[data-representation-table-id="${beforeDrag.id}"]')?.offsetLeft===${beforeDrag.left+300}`,'restoring a drawing lost its position');
  const afterDrawingActions=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${modelId}`),200,'read mappings after canvas actions').body.items;
  invariant(JSON.stringify(afterDrawingActions.map((item)=>item.versionId).sort())===JSON.stringify(mappings.map((item)=>item.versionId).sort()),'canvas actions modified mapping versions');

  return { sourceId: createdSource.id, sourceName, snapshotId, modelId };
}

async function edgeEditingFlow(physical) {
  const route=`/models/${physical.modelId}/mappings?physicalSnapshotId=${physical.snapshotId}`;
  await navigate(route,'christian.man');
  await waitFor("document.querySelector('.mapping-edge .edge-hit')!==null",'interactive mapping lines did not render');
  const before=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${physical.modelId}`),200,'read line-edit mappings').body.items;
  const mapping=before.find((item)=>item.physicalSnapshotId===physical.snapshotId&&item.logicalFieldVersionIds.length===1&&item.physicalColumnIds.length===1);
  invariant(mapping,'line-edit test requires a single-field PG mapping');
  const mappingId=mapping.id,fieldId=mapping.logicalFieldVersionIds[0],columnId=mapping.physicalColumnIds[0];
  const nextColumn=await evaluate(`(() => {const original=document.querySelector('[data-physical-column-id="${columnId}"]');return [...original.closest('.physical-representation').querySelectorAll('.column-endpoint')].find((item)=>item.dataset.physicalColumnId!=='${columnId}').dataset.physicalColumnId;})()`);
  const nextField=before.find((item)=>item.id!==mappingId&&item.physicalSnapshotId===physical.snapshotId&&item.logicalFieldVersionIds.length===1&&!item.physicalColumnIds.includes(nextColumn)).logicalFieldVersionIds[0];
  // Exercise the viewport-filling fallback here; native Escape always exits browser fullscreen.
  await evaluate("document.querySelector('.mapping-shell').requestFullscreen=undefined;document.querySelector('.fullscreen-toggle').click()");
  await waitFor("document.querySelector('.mapping-shell.is-fullscreen')?.getBoundingClientRect().height>=innerHeight-1",'line editor viewport did not open');
  await evaluate('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const edgePoint=()=>evaluate(`(() => {const path=document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-hit');for(const fraction of [.5,.35,.65,.2,.8]){const point=path.getPointAtLength(path.getTotalLength()*fraction),screen=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM());if(document.elementFromPoint(screen.x,screen.y)?.closest('.mapping-edge'))return {x:screen.x,y:screen.y};}throw new Error('No unobstructed hit point on the selected line');})()`);
  const point=await edgePoint();
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
  await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"]').classList.contains('is-hovered')&&parseFloat(getComputedStyle(document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-line')).strokeWidth)>2`,'line hover did not thicken the actual edge');
  await captureScreenshot('mapping-line-hover-1440x900.png');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1},sessionId);
  await waitFor("document.querySelectorAll('.edge-handles circle').length===2",'selecting a line did not expose its two draggable ends');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:900,y:300},sessionId);
  await waitFor(`parseFloat(getComputedStyle(document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-line')).strokeWidth)<=1.5`,'line remained thick after pointer departure');
  async function dragEnd(side,targetSelector) {
    await evaluate(`(() => {document.querySelector('[data-edge-handle="${side}"]').scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});document.querySelector(${JSON.stringify(targetSelector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});})()`);
    await evaluate('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const positions=await evaluate(`(() => {const handle=document.querySelector('[data-edge-handle="${side}"]'),target=document.querySelector(${JSON.stringify(targetSelector)}),a=handle.getBoundingClientRect(),b=target.getBoundingClientRect();return {from:{x:a.left+a.width/2,y:a.top+a.height/2},to:{x:b.left+b.width/2,y:b.top+b.height/2}};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...positions.from},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...positions.from,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:positions.from.x+(positions.to.x-positions.from.x)*step/4,y:positions.from.y+(positions.to.y-positions.from.y)*step/4,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...positions.to,button:'left',buttons:0,clickCount:1},sessionId);
  }
  await dragEnd('physical',`[data-physical-column-id="${nextColumn}"]`);
  try {await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-line')?.dataset.edgePhysicalColumnId==='${nextColumn}'`,'physical endpoint was not rewired within its table');}
  catch(error){await captureScreenshot('mapping-line-drag-failure.png');throw new Error(error.message+' '+JSON.stringify(await evaluate(`({announcement:document.querySelector('p[aria-live="polite"]')?.textContent,fullscreen:document.querySelector('.mapping-shell')?.classList.contains('is-fullscreen')})`)));}
  await dragEnd('logical',`[data-logical-field-id="${nextField}"]`);
  await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-line')?.dataset.edgeLogicalFieldId==='${nextField}'`,'logical endpoint was not rewired within its model');
  async function openLineMenu() {
    await evaluate(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-hit').scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
    await evaluate('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    let p;
    try{p=await edgePoint();}catch(error){await captureScreenshot('mapping-line-hit-failure.png');throw error;}

    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'right',buttons:2,clickCount:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'right',buttons:0,clickCount:1},sessionId);
    await waitFor("document.querySelector('.edge-context-menu')!==null",'right click did not open line context actions');
  }
  await openLineMenu();
  await evaluate(`(() => {const type=document.querySelector('select[aria-label="Mapping-Typ der Beziehung"]');type.value='Derived';type.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor("document.querySelector('.edge-context-menu textarea')!==null",'derived mapping did not offer its rule input');
  await evaluate("(() => {const rule=document.querySelector('.edge-context-menu textarea');rule.value='concat(source_a, source_b)';rule.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await captureScreenshot('mapping-line-context-menu-1440x900.png');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
  invariant(await evaluate("document.querySelector('.mapping-shell').classList.contains('is-fullscreen')"),'dismissing line menu exited fullscreen');
  await clickText('.toolbar-actions button','Entwurf speichern');
  await waitFor("document.querySelector('.draft-save-action>button').disabled&&document.body.innerText.includes('Alle Mapping-Entwürfe wurden versioniert gespeichert')",'line edits did not save');
  const saved=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${physical.modelId}`),200,'read saved line edits').body.items.find((item)=>item.id===mappingId);
  invariant(saved.status==='draft'&&saved.mappingType==='Derived'&&saved.transformationRule==='concat(source_a, source_b)'&&saved.physicalSnapshotId===mapping.physicalSnapshotId&&saved.logicalFieldVersionIds[0]===nextField&&saved.physicalColumnIds[0]===nextColumn&&saved.versionId!==mapping.versionId,'saved line changes lost endpoint, snapshot, type or successor identity');
  await navigate(route,'christian.man');
  await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-line')?.dataset.edgePhysicalColumnId==='${nextColumn}'`,'line edits did not survive reload');
  invariant(await evaluate(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-hit title')?.textContent.includes('aus einem oder mehreren Feldern')`),'assigned line type lacks its tooltip explanation');
  await evaluate(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-hit').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  await waitFor("document.querySelector('.mapping-detail h2 .daca-glossary-trigger')?.textContent==='Derived'",'assigned inspector type did not render');
  async function hoverAssignedType(selector) {
    const point=await evaluate(`(() => {const trigger=[...document.querySelectorAll(${JSON.stringify(selector)})].find((item)=>item.textContent==='Derived');trigger.scrollIntoView({block:'center',behavior:'instant'});const r=trigger.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
  }
  await hoverAssignedType('.mapping-detail h2 .daca-glossary-trigger');
  await waitFor("document.querySelector('.mapping-detail .daca-glossary-tooltip.is-visible')?.textContent.includes('aus einem oder mehreren Feldern')",'assigned inspector type tooltip did not appear on hover');
  await waitFor(`(() => {const trigger=document.querySelector('.mapping-detail h2 .daca-glossary-trigger').getBoundingClientRect(),tip=document.querySelector('.mapping-detail .daca-glossary-tooltip.is-visible').getBoundingClientRect();return (tip.bottom<=trigger.top||tip.top>=trigger.bottom)&&tip.left>=0&&tip.right<=innerWidth;})()`,'type tooltip covers its assigned value or leaves the viewport');
  await captureScreenshot('mapping-assigned-type-tooltip-1440x900.png');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:300},sessionId);
  await evaluate("document.querySelector('.mapping-detail h2 .daca-glossary-trigger').focus()");
  await waitFor("document.querySelector('.mapping-detail .daca-glossary-tooltip.is-visible')!==null",'assigned type tooltip is not keyboard accessible');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
  await waitFor("document.querySelector('.mapping-detail .daca-glossary-tooltip.is-visible')===null",'assigned type tooltip did not dismiss with Escape');
  await clickText('.mapping-toolbar nav button','Tabelle');
  await waitFor("document.querySelector('.mapping-matrix .daca-glossary-trigger')!==null",'assigned table types did not render');
  await hoverAssignedType('.mapping-matrix .daca-glossary-trigger');
  await waitFor("[...document.querySelectorAll('.mapping-matrix .daca-glossary-tooltip.is-visible')].some((item)=>item.textContent.includes('aus einem oder mehreren Feldern'))",'assigned table type tooltip did not appear on hover');
  invariant(await evaluate("document.querySelector('.draft-save-action>button').disabled"),'inspecting a mapping type created unsaved changes');
  await clickText('.mapping-toolbar nav button','Graph');
  await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-hit')!==null`,'graph did not return after tooltip inspection');
  const representationCount=await evaluate('document.querySelectorAll(".physical-representation").length');
  await openLineMenu();
  await evaluate("window.__originalConfirm=window.confirm;window.confirm=()=>false");
  await clickText('.edge-context-menu button','Beziehung löschen');
  invariant(await evaluate(`document.querySelector('[data-edge-mapping-id="${mappingId}"]')!==null`),'canceling line deletion removed its edge');
  await openLineMenu();
  await evaluate('window.confirm=()=>true');
  await clickText('.edge-context-menu button','Beziehung löschen');
  await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"]')===null`,'deleting relationship did not remove its edge');
  await evaluate('window.confirm=window.__originalConfirm;delete window.__originalConfirm');
  invariant(await evaluate('document.querySelectorAll(".physical-representation").length')===representationCount,'relationship deletion removed a physical representation');
  const deleted=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${physical.modelId}`),200,'read deleted relationship history').body.items.find((item)=>item.id===mappingId);
  invariant(deleted.status==='superseded','line deletion did not preserve superseded history');
  console.log(`PASS line-editing: ${mappingId}`);
}

async function domainAssignmentFlow(physical) {
  const reference=expectStatus(await api('christian.man',`/api/v1/logical-models/${physical.modelId}`),200,'read domain test reference').body;
  const domainId=reference.dataDomainId;
  const domainSource=expectStatus(await api('christian.man','/api/v1/physical-sources',{method:'POST',body:{name:`Canvas Domain QA ${Date.now()}`,description:'Synthetic domain assignment fixture.',adapterType:'fixture',configRef:`fixture.canvas-domain-${Date.now()}`,departmentCode:reference.departmentCode,organizationId:reference.organizationId}}),201,'create isolated domain fixture source');
  const imported=expectStatus(await api('christian.man',`/api/v1/physical-sources/${domainSource.body.id}/imports`,{method:'POST',etag:domainSource.headers.etag,body:{fixtureVariant:'baseline'}}),200,'import isolated domain fixture');
  const domainTable=imported.body.databases.flatMap((database)=>database.schemas).flatMap((schema)=>schema.tables).find((table)=>table.name==='vehicle_inventory');
  try {

  const write={identifiers:[`EDGE-DOMAIN-${Date.now()}`],localizations:[{language:'de',title:'Canvas Domänenprüfung',description:'Synthetischer Entwurf für explizite Domänenzuordnungen.'}],
    dataOwnerUserId:reference.dataOwnerUserId,deputyOwnerUserId:reference.deputyOwnerUserId,creator:{type:'Application',applicationName:'Canvas QA'},dataDomainId:null,
    organizationUnitId:reference.organizationId,dataClassification:'internal',dateCreated:new Date().toISOString().slice(0,10),contactPoints:[{name:'Canvas QA',email:'canvas@example.test'}],publisher:reference.publisher,
    accessRights:'urn:daca:access-rights:internal',entities:[{name:'vehicle_inventory',businessObject:'Fahrzeug',fields:[{name:'vehicle_id',dataType:'uuid',shortDescription:'Synthetischer Fahrzeugschlüssel',businessObject:'Fahrzeug',classification:'internal',nullable:false,minCount:1,maxCount:1}]}]};
  const created=expectStatus(await api('christian.man','/api/v1/logical-models',{method:'POST',body:write}),201,'create model awaiting domain');
  const modelId=created.body.id;
  const memberships=expectStatus(await api('christian.man',`/api/v1/logical-models/${physical.modelId}/representations`),200,'read domain test representations').body.items;
  const domainMemberships=[...memberships.filter((item)=>item.physicalSnapshotId!==physical.snapshotId),{physicalSnapshotId:imported.body.snapshot.id,physicalTableId:domainTable.id}];
  expectStatus(await api('christian.man',`/api/v1/logical-models/${modelId}/mapping-drafts`,{method:'POST',etag:created.headers.etag,body:{logicalModelVersionId:created.body.versionId,representations:domainMemberships.map(({physicalSnapshotId,physicalTableId})=>({physicalSnapshotId,physicalTableId})),mappings:[]}}),200,'attach domain test representations without field links');
  const route=`/models/${modelId}/mappings`;
  await navigate(route,'christian.man');
  await waitFor("document.querySelectorAll('.physical-representation').length===2&&document.querySelector('.logical-node .model-domain')?.textContent.includes('Keine Domäne')",'unassigned domain headers did not render');
  const pgId=await evaluate("[...document.querySelectorAll('.physical-representation')].find((card)=>!card.textContent.includes('.parquet')).dataset.representationTableId");
  await evaluate("document.querySelector('.field-endpoint').click();[...document.querySelectorAll('.physical-representation')].find((card)=>card.textContent.includes('.parquet')).querySelector('.column-endpoint').click()");
  await waitFor("document.querySelector('.mapping-dialog[open]')!==null",'local mapping editor did not open for domain rebase test');
  await clickText('.mapping-dialog button','Zuordnung übernehmen');
  await waitFor("document.querySelector('.draft-save-action>button').disabled===false",'local mapping draft did not survive initial creation');
  const openLogical=async()=>{await evaluate("document.querySelector('.logical-node>header').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:250,clientY:200}))");await waitFor("[...document.querySelectorAll('.canvas-context-menu button')].some((button)=>button.textContent==='Domäne zuordnen')",'logical domain context action missing');};
  await openLogical();
  const hover=await evaluate("(() => {const row=[...document.querySelectorAll('.canvas-context-menu button')].find((button)=>button.textContent==='Domäne zuordnen'),r=row.getBoundingClientRect();return{x:r.left+15,y:r.top+r.height/2,background:getComputedStyle(row).backgroundColor};})()");
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:hover.x,y:hover.y},sessionId);
  await waitFor(`(() => {const row=[...document.querySelectorAll('.canvas-context-menu button')].find((button)=>button.textContent==='Domäne zuordnen'),style=getComputedStyle(row);return style.backgroundColor!==${JSON.stringify(hover.background)}&&style.boxShadow.includes('inset');})()`,'menu hover does not highlight the entire row');
  await captureScreenshot('model-domain-menu-hover-1440x900.png');
  await openLogical();
  await clickText('.canvas-context-menu button','Domäne zuordnen');
  await waitFor("document.querySelectorAll('.model-domain-dialog input[type=checkbox]:checked').length===2&&!document.querySelector('.model-domain-dialog button:last-child').textContent.includes('Wird')",'physical models were not preselected for logical assignment');
  await clickText('.model-domain-dialog footer button','Abbrechen');
  invariant(expectStatus(await api('christian.man',`/api/v1/logical-models/${modelId}`),200,'read model after domain cancellation').body.dataDomainId===null,'cancelled domain assignment wrote the logical model');
  await openLogical();await clickText('.canvas-context-menu button','Domäne zuordnen');
  await waitFor(`document.querySelector('.model-domain-dialog select option[value="${domainId}"]')!==null`,'active domain option missing');
  await evaluate(`(() => {const select=document.querySelector('.model-domain-dialog select');select.value=${JSON.stringify(domainId)};select.dispatchEvent(new Event('change',{bubbles:true}));const row=[...document.querySelectorAll('.physical-domain-choice')].find((row)=>!row.textContent.includes('.parquet')),checkbox=row.querySelector('input');checkbox.checked=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await capturePageSegmentScreenshot('.model-domain-dialog','model-domain-propagation-1440x900.png');
  await waitFor("document.querySelector('.model-domain-dialog footer button:last-child')?.disabled===false",'domain assignment is not ready to save');
  await clickText('.model-domain-dialog footer button','Zuordnen');
  await waitFor("document.querySelector('.model-domain-dialog')===null&&!document.querySelector('.logical-node .model-domain').textContent.includes('Keine Domäne')",'logical domain assignment did not update the header');
  invariant(await evaluate("document.querySelector('.draft-save-action>button').disabled===false"),'logical assignment discarded the local mapping draft');
  const pgState=expectStatus(await api('christian.man',`/api/v1/physical-tables/${pgId}/domains`),200,'read unchecked physical domain').body;
  invariant(pgState.dataDomains.length===0,'unchecked physical object was assigned implicitly');
  await evaluate(`document.querySelector('[data-representation-table-id="${pgId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:250}))`);
  await clickText('.representation-context-menu button','Domäne zuordnen');
  await waitFor(`document.querySelector('.model-domain-dialog select option[value="${domainId}"]')!==null`,'physical domain modal missing');
  invariant(await evaluate("document.querySelector('.model-domain-dialog fieldset')===null"),'physical assignment unexpectedly propagates to other objects');
  await evaluate(`(() => {const select=document.querySelector('.model-domain-dialog select');select.value=${JSON.stringify(domainId)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor("document.querySelector('.model-domain-dialog footer button:last-child')?.disabled===false",'domain assignment is not ready to save');
  await clickText('.model-domain-dialog footer button','Zuordnen');
  await waitFor(`document.querySelector('.model-domain-dialog')===null&&!document.querySelector('[data-representation-table-id="${pgId}"] .model-domain').textContent.includes('Keine Domäne')`,'physical domain assignment did not update the header');
  await clickText('.toolbar-actions button','Entwurf speichern');
  await waitFor("document.querySelector('.draft-save-action>button').disabled===true&&document.body.innerText.includes('Alle Mapping-Entwürfe wurden versioniert gespeichert')",'mapping draft was not rebased after logical domain assignment');
  await navigate(route,'christian.man');
  await waitFor("document.querySelectorAll('.physical-representation .model-domain').length===2&&[...document.querySelectorAll('.model-domain')].every((label)=>!label.textContent.includes('Keine Domäne'))",'domain labels did not survive reload');
  await evaluate(`document.querySelector('[data-representation-table-id="${pgId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:250}))`);
  invariant(await evaluate(`document.querySelector('.representation-context-menu a')?.getAttribute('href')==='/domains/${domainId}'&&document.querySelector('.representation-context-menu a')?.target==='_blank'`),'assigned physical domain cannot be opened');
  await evaluate("document.querySelector('.logical-node>header').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:250,clientY:200}))");
  invariant(await evaluate(`document.querySelector('.canvas-context-menu a')?.getAttribute('href')==='/domains/${domainId}'`),'assigned logical domain cannot be opened');
  await capturePageSegmentScreenshot('.mapping-shell','model-domain-assigned-1440x900.png');
  await navigate(`/domains/${domainId}`,'christian.man');
  await waitFor(`document.querySelector('.domain-models a[href="/models/${modelId}"]')!==null&&document.querySelector('.domain-models a[href*="tableId=${pgId}"]')!==null`,'assigned models missing from domain detail');
  await evaluate("(() => {const input=document.querySelector('.model-search input');input.value='Canvas Domänenprüfung';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await waitFor(`document.querySelector('.domain-models a[href="/models/${modelId}"]')!==null&&document.querySelectorAll('.model-lists section:last-child a').length===0`,'domain model search did not filter both lists');
  await evaluate("(() => {const input=document.querySelector('.model-search input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await capturePageSegmentScreenshot('.domain-models','domain-searchable-models-1440x900.png');
  await evaluate(`document.querySelector('.domain-models a[href*="tableId=${pgId}"]').click()`);
  await waitFor(`document.querySelector('daca-physical-object-detail')?.innerText.includes('vehicle_inventory')`,'domain model link did not inspect its exact object');
  return {modelId};
  } finally {expectStatus(await api('christian.spider',`/api/v1/physical-sources/${domainSource.body.id}/retire`,{method:'POST',etag:imported.headers.etag}),200,'retire only this test-created domain fixture source');}
}

async function personnelOntologyFlow() {
  const domains=expectStatus(await api('christian.man','/api/v1/domains'),200,'read Personnel domain').body;
  const personnel=domains.find(domain=>domain.preferredLabel==='Personal');
  invariant(personnel,'Personal demo domain missing');
  await navigate(`/domains/${personnel.id}`,'christian.man');
  await waitFor("document.querySelectorAll('.semantic-graph .graph-node.is-term').length>=10",'Personnel ontology did not show its demo terms');
  invariant(await evaluate("[...document.querySelectorAll('.graph-edge-label')].some(label=>label.textContent==='hat Oberbegriff')"),'ontology relationship labels missing');
  invariant(await evaluate("document.querySelectorAll('.semantic-graph .graph-node.is-relation').length===0"),'internal term relations created duplicate graph nodes');
  await capturePageSegmentScreenshot('.semantic-graph','personnel-ontology-1440x900.png');
  await evaluate(`document.querySelector('[aria-label="Ontologie vergrössern"]').click()`);
  await navigate(`/domains/${personnel.id}`,'christian.man',390,844);
  await waitFor("document.querySelectorAll('.domain-term-list article').length>=10",'Personnel terms missing on mobile');
  invariant(await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),'domain detail overflows the mobile viewport');
  await captureScreenshot('personnel-domain-390x844.png');
  console.log('PASS personnel ontology and searchable domain models');
}

async function conceptNetworkEditingFlow() {
  await navigate('/domains','christian.man');
  const suffix=Date.now();
  const domain=expectStatus(await api('sibilla.micheli','/api/v1/domains',{method:'POST',body:{ownerUserId:'kassandra.valdata',deputyOwnerUserId:'ariane.keller',localizations:[{language:'de',preferredLabel:`Begriffsnetz QA ${suffix}`,definition:'Isolierte synthetische Testdomäne für den Begriffsnetz-Editor.'}]}}),201,'create isolated concept network domain');
  const approve=async(proposal)=>{let result=proposal;for(const review of proposal.reviews)result=expectStatus(await api(review.ownerUserId,`/api/v1/glossary/term-proposals/${proposal.id}/reviews/${review.domainId}/decision`,{method:'POST',etag:`"${proposal.revision}"`,body:{decision:'approve',comment:'Synthetische Editorprüfung.'}}),200,'approve synthetic concept change').body;return result;};
  const create=async(label,relations=[])=>{const proposal=expectStatus(await api('christian.man','/api/v1/glossary/term-proposals',{method:'POST',body:{operation:'create',payload:{domainIds:[domain.body.id],localizations:[{language:'de',preferredLabel:label,definition:`Synthetischer Begriff ${label}.`}],relations}}}),201,'create synthetic concept proposal').body;return(await approve(proposal)).targetTermId;};
  try {
    const b=await create('Person'),a=await create('Mitarbeitende',[{relation:'broader',targetTermId:b}]),c=await create('Anstellung');
    const route=`/domains/${domain.body.id}`;
    await navigate(route,'christian.man');await waitFor("document.querySelectorAll('.network-editor .is-term').length===3",'editable concept cards missing');
    await evaluate("document.querySelector('.network-editor').requestFullscreen=undefined;document.querySelector('.network-editor .fullscreen-toggle').click()");
    await waitFor("document.querySelector('.network-editor.is-fullscreen')!==null",'concept editor fullscreen missing');
    const bounds=async(selector)=>evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+15,left:r.left,top:r.top};})()`);
    const aHeader=`[data-term-id="${a}"] header`;
    const before=await bounds(aHeader);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+step*35,y:before.y+step*50,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+140,y:before.y+200,button:'left',buttons:0,clickCount:1},sessionId);
    const moved=await bounds(aHeader);invariant(moved.left>before.left+100&&moved.top>before.top+40,'concept card did not move freely');
    await evaluate(`document.querySelector(${JSON.stringify(aHeader)}).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const aPosition=await evaluate(`document.querySelector('[data-term-id="${a}"]').style.cssText`);
    const relation=()=>evaluate("[...document.querySelectorAll('.graph-relationship')].find(edge=>edge.dataset.edgeId.startsWith('relation:')).dataset.edgeId");
    let edgeId=await relation();
    const edgePoint=async()=>evaluate(`(() => {const p=document.querySelector('[data-edge-id="${edgeId}"] .edge-hit');for(const f of [.5,.3,.7]){const v=p.getPointAtLength(p.getTotalLength()*f),s=new DOMPoint(v.x,v.y).matrixTransform(p.getScreenCTM());if(document.elementFromPoint(s.x,s.y)?.closest('.graph-relationship'))return{x:s.x,y:s.y};}throw new Error('No reachable concept relationship point');})()`);
    await captureScreenshot('concept-before-edge.png');
    let point=await edgePoint();await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
    await waitFor(`parseFloat(getComputedStyle(document.querySelector('[data-edge-id="${edgeId}"] .graph-edge')).strokeWidth)>2`,'concept edge hover missing');
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',buttons:2,clickCount:1},sessionId);await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',buttons:0,clickCount:1},sessionId);
    await waitFor("document.querySelector('.relation-dialog')!==null",'relationship context menu missing');
    await evaluate("(() => {const select=document.querySelectorAll('.relation-dialog select')[1];select.value='related';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await captureScreenshot('concept-relationship-context-1440x900.png');await clickText('.relation-dialog button','Entwurf übernehmen');
    await waitFor("document.querySelector('.relation-dialog')===null&&document.querySelectorAll('.edge-handles circle').length===2",'relationship edit did not expose draggable ends');
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const positions=await evaluate(`(() => {const from=document.querySelector('[data-edge-handle="target"]').getBoundingClientRect(),to=document.querySelector('[data-term-id="${c}"]').getBoundingClientRect();return{from:{x:from.left+from.width/2,y:from.top+from.height/2},to:{x:to.left+to.width/2,y:to.top+to.height/2}};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...positions.from,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:positions.from.x+(positions.to.x-positions.from.x)*step/4,y:positions.from.y+(positions.to.y-positions.from.y)*step/4,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...positions.to,button:'left',buttons:0,clickCount:1},sessionId);
    try{await waitFor(`document.querySelector('[data-edge-id="${edgeId}"]')?.getAttribute('data-target-id')==='term:${c}'`,'rewired edge did not render its new target');}catch(error){await captureScreenshot('concept-drop-failure.png');throw new Error(error.message+' '+JSON.stringify(await evaluate(`({notice:document.querySelector('.network-editor [role=status]')?.textContent,alerts:[...document.querySelectorAll('[role=alert]')].map(item=>item.textContent),edges:[...document.querySelectorAll('.graph-relationship')].map(item=>({id:item.dataset.edgeId,target:item.dataset.targetId}))})`)));}
    await evaluate(`document.querySelector('[data-edge-id="${edgeId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
    try{await waitFor(`document.querySelectorAll('.relation-dialog select')[2]?.value==='${c}'`,'dragging the concept endpoint did not rewire its target');}catch(error){await captureScreenshot('concept-rewire-failure.png');throw new Error(error.message+' '+JSON.stringify(await evaluate(`({from:${JSON.stringify(positions.from)},to:${JSON.stringify(positions.to)},notice:document.querySelector('.network-editor [role=status]')?.textContent,expected:${JSON.stringify({a,b,c})},selects:[...document.querySelectorAll('.relation-dialog select')].map(item=>item.value),alerts:[...document.querySelectorAll('[role=alert]')].map(item=>item.textContent),target:document.elementsFromPoint(${positions.to.x},${positions.to.y}).map(item=>item.tagName+'.'+item.classList).slice(0,8)})`)));}
    await clickText('.relation-dialog button','Beziehung löschen');await waitFor("[...document.querySelectorAll('.graph-relationship')].every(edge=>!edge.dataset.edgeId.startsWith('relation:'))",'concept relationship deletion did not create a local draft');
    await evaluate("document.querySelector('.network-editor .fullscreen-toggle').click()");
    const reload=cdp.call('Page.reload',{ignoreCache:true},sessionId);await sleep(250);try{await cdp.call('Page.handleJavaScriptDialog',{accept:true},sessionId);}catch{}await reload;
    await waitFor("document.querySelector('.network-editor')?.innerText.includes('Lokaler Entwurf wiederhergestellt')",'concept draft did not survive reload');
    invariant(await evaluate(`document.querySelector('[data-term-id="${a}"]').style.cssText===${JSON.stringify(aPosition)}`),'concept arrangement did not survive reload');
    await evaluate(`document.querySelector('[data-term-id="${a}"] header').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}))`);
    await waitFor("document.querySelector('.concept-context-menu')!==null",'concept keyboard context menu missing');await clickText('.concept-context-menu button','Neue Beziehung');
    await evaluate(`document.querySelector('[data-term-id="${c}"]').click()`);await waitFor("document.querySelector('.relation-dialog')!==null",'keyboard connection did not start a new relation');await clickText('.relation-dialog button','Abbrechen');
    await evaluate("document.querySelector('.network-editor').requestFullscreen=undefined;document.querySelector('.network-editor .fullscreen-toggle').click()");await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const portDrag=await evaluate(`(() => {const from=document.querySelector('[data-term-id="${a}"] .ontology-port.is-right').getBoundingClientRect(),to=document.querySelector('[data-term-id="${c}"]').getBoundingClientRect();return{from:{x:from.left+from.width/2,y:from.top+from.height/2},to:{x:to.left+to.width/2,y:to.top+to.height/2}};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...portDrag.from,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:portDrag.from.x+(portDrag.to.x-portDrag.from.x)*step/4,y:portDrag.from.y+(portDrag.to.y-portDrag.from.y)*step/4,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...portDrag.to,button:'left',buttons:0,clickCount:1},sessionId);
    await waitFor(`document.querySelector('.relation-dialog')?.getAttribute('data-target-id')==='${c}'`,'dragging a connection port did not select the target');await clickText('.relation-dialog button','Entwurf übernehmen');await captureScreenshot('concept-network-editable-1440x900.png');
    await evaluate(`(() => {window.__conceptPrint=false;const append=document.body.append.bind(document.body);document.body.append=(...nodes)=>{append(...nodes);const frame=nodes.find(node=>node instanceof HTMLIFrameElement);if(frame){frame.contentWindow.print=()=>window.__conceptPrint=true;document.body.append=append;}};document.querySelector('.network-editor .canvas-print').click();})()`);
    await waitFor('window.__conceptPrint===true','concept network printing failed');invariant(await evaluate("document.querySelector('.mapping-print-frame').contentDocument.querySelectorAll('.graph-node.is-term').length===3"),'concept printing clipped model cards');await evaluate("document.querySelector('.mapping-print-frame').remove()");
    await clickText('.network-editor .draft-actions button','Änderungen einreichen');await waitFor("document.querySelector('.pending-proposals a')!==null",'concept changes were not submitted for domain approval');
    const proposals=expectStatus(await api('christian.man','/api/v1/glossary/term-proposals'),200,'read submitted concept draft').body;
    const proposed=proposals.find(value=>value.targetTermId===a&&value.status==='in_review');invariant(proposed&&proposed.reviewPayload.relations[0].targetTermId===c,'submitted relation does not match the edited graph');
    await approve(proposed);await navigate(route,'christian.man');await waitFor("document.querySelector('.network-editor')!==null",'approved concept graph missing');
    const persisted=expectStatus(await api('christian.man',`/api/v1/glossary/terms/${a}`),200,'read approved concept graph').body;
    invariant(persisted.relations.length===1&&persisted.relations[0].targetTermId===c,'approved relationship did not persist');
    console.log('PASS editable concept network: drag, edges, context menus, rewiring, drafts, print and approval');
  } finally {expectStatus(await api('sibilla.micheli',`/api/v1/domains/${domain.body.id}/retire`,{method:'POST',etag:`"${domain.body.revision}"`,body:{}}),200,'retire only this synthetic editor domain');}
}

async function existingToExistingFlow(physical) {
  const organizationModelId = 'be6eb7a4-6bf3-5387-8aaa-86c01a46290b';
  const logicalModel = expectStatus(
    await api('cinthya.thor', `/api/v1/logical-models/${organizationModelId}`),
    200,
    'load existing organization model',
  ).body;
  const snapshot = expectStatus(
    await api('cinthya.thor', `/api/v1/physical-snapshots/${physical.snapshotId}`),
    200,
    'load existing physical snapshot',
  ).body;
  const logicalField = logicalModel.entities
    .flatMap((entity) => entity.fields)
    .find((field) => field.name === 'code');
  const vehicleTable = snapshot.databases
    .flatMap((database) => database.schemas)
    .flatMap((schema) => schema.tables)
    .find((table) => table.name === 'vehicle_inventory');
  const driftedColumn = vehicleTable?.columns.find((column) => column.name === 'designation_de');
  invariant(logicalField && driftedColumn, 'Existing-to-existing fixtures are incomplete');

  let mapping = expectStatus(await api('cinthya.thor', '/api/v1/asset-mappings', {
    method: 'POST',
    body: {
      logicalModelVersionId: logicalModel.versionId,
      physicalSnapshotId: physical.snapshotId,
      mappingType: 'Renamed',
      classification: 'internal',
      transformationRule: null,
      comment: 'Edge E2E existing-to-existing mapping.',
      responsibleUserId: 'cinthya.thor',
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: null,
      logicalFieldVersionIds: [logicalField.fieldVersionId],
      physicalColumnIds: [driftedColumn.id],
    },
  }), 201, 'create existing-to-existing mapping').body;
  mapping = expectStatus(await api(
    'cinthya.thor',
    `/api/v1/asset-mappings/${mapping.id}/versions/${mapping.versionId}/submit`,
    { method: 'POST', etag: `"${mapping.lockVersion}"` },
  ), 200, 'submit existing-to-existing mapping').body;
  mapping = expectStatus(await api(
    'cinthya.thor',
    `/api/v1/asset-mappings/${mapping.id}/versions/${mapping.versionId}/validate`,
    { method: 'POST', etag: `"${mapping.lockVersion}"` },
  ), 200, 'validate existing-to-existing mapping').body;
  invariant(mapping.status === 'validated', `Expected validated mapping, received ${mapping.status}`);

  await navigate(
    `/models/${organizationModelId}/mappings?view=table&physicalSnapshotId=${physical.snapshotId}`,
    'cinthya.thor',
  );
  try {
    await waitFor(
      "document.querySelector('.mapping-matrix') && document.body.innerText.includes('Gültig')",
      'validated mapping did not appear in the matrix',
    );
  } catch (error) {
    const context = await evaluate(`(() => ({
      url: location.href,
      matrix: document.querySelector('.mapping-matrix')?.innerText.slice(0, 800),
      alert: [...document.querySelectorAll('[role="alert"]')].map((item) => item.innerText),
      snapshot: document.querySelector('.representation-panel')?.innerText.slice(0, 500),
    }))()`);
    throw new Error(`${error.message}: ${JSON.stringify(context)}`);
  }
  await cdp.call('Page.reload', { ignoreCache: true }, sessionId);
  await waitFor(
    "document.querySelector('.mapping-matrix') && document.body.innerText.includes('Gültig')",
    'mapping did not survive an Edge reload',
  );

  const snapshotSequenceBeforeDrift = Math.max(...expectStatus(
    await api('christian.man', `/api/v1/physical-snapshots?sourceId=${physical.sourceId}`),
    200,
    'read physical snapshot sequence before drift import',
  ).body.items.map((snapshot) => snapshot.sequence));
  await navigate('/physical-models', 'christian.man');
  await waitFor(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(physical.sourceName)}));
    const button = [...(card?.querySelectorAll('button') ?? [])]
      .find((item) => item.textContent.includes('Neu importieren'));
    return Boolean(button) && !button.disabled;
  })()`, 'drift source did not become ready for a follow-up import');
  const driftImportStarted = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(physical.sourceName)}));
    const button = [...(card?.querySelectorAll('button') ?? [])]
      .find((item) => item.textContent.includes('Neu importieren'));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  invariant(driftImportStarted, 'drift import action was unavailable');
  let snapshots = [];
  const importDeadline = Date.now() + 12_000;
  while (Date.now() < importDeadline) {
    snapshots = expectStatus(
      await api('christian.man', `/api/v1/physical-snapshots?sourceId=${physical.sourceId}`),
      200,
      'list snapshots after drift',
    ).body.items;
    if (snapshots.some((snapshot) => snapshot.sequence > snapshotSequenceBeforeDrift)) break;
    await sleep(120);
  }
  invariant(snapshots.some((snapshot) => snapshot.sequence > snapshotSequenceBeforeDrift), 'fixture drift import did not append its immutable snapshot');
  await waitFor(
    "!document.body.innerText.includes('Import läuft')",
    'fixture drift import remained busy in Edge',
  );
  const currentSnapshotId = snapshots.reduce((latest, snapshot) => (
    snapshot.sequence > latest.sequence ? snapshot : latest
  )).id;
  invariant(currentSnapshotId !== physical.snapshotId, 'Drift import did not append a new snapshot');
  const broken = expectStatus(
    await api('cinthya.thor', `/api/v1/asset-mappings?logicalModelId=${organizationModelId}`),
    200,
    'read drifted mapping',
  ).body.items.find((item) => item.id === mapping.id);
  invariant(broken?.status === 'broken', `Drifted mapping must be broken, received ${broken?.status}`);

  await navigate(
    `/models/${organizationModelId}/mappings?view=table&physicalSnapshotId=${currentSnapshotId}`,
    'cinthya.thor',
  );
  await waitFor(
    "document.querySelector('.mapping-matrix') && document.body.innerText.includes('Gebrochen')",
    'broken mapping did not appear against the latest snapshot',
  );
  const focused = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.mapping-matrix .row-action')]
      .find((item) => item.textContent.includes('Auflösen'));
    if (!button) return false;
    button.focus();
    return document.activeElement === button;
  })()`);
  invariant(focused, 'keyboard-only matrix edit action could not receive focus');
  await pressKey('Enter', 'Enter', 13);
  await waitFor("document.querySelector('.mapping-dialog[open]') !== null", 'Enter did not open the mapping dialog');
  try {
    await waitFor(
      "[...document.querySelectorAll('.mapping-dialog select[formcontrolname=\"physicalColumnIds\"] option')].some((option) => option.textContent.includes('logistics.vehicle_inventory.designation_de'))",
      'Current snapshot replacement column did not load in the dialog',
    );
  } catch (error) {
    const context = await evaluate(`(() => ({
      url: location.href,
      options: [...document.querySelectorAll('.mapping-dialog select[formcontrolname="physicalColumnIds"] option')].map((option) => option.textContent),
      workspace: document.querySelector('.mapping-shell')?.innerText.slice(0, 800),
    }))()`);
    throw new Error(`${error.message}: ${JSON.stringify(context)}`);
  }
  const targetIndex = await evaluate(`(() => {
    const select = document.querySelector('.mapping-dialog select[formcontrolname="physicalColumnIds"]');
    const options = [...select.options];
    const index = options.findIndex((option) => option.textContent.includes('logistics.vehicle_inventory.designation_de'));
    select.focus();
    return index;
  })()`);
  invariant(targetIndex >= 0, 'Current snapshot replacement column is missing from the dialog');
  await pressKey('Home', 'Home', 36);
  for (let index = 0; index < targetIndex; index += 1) {
    await pressKey('ArrowDown', 'ArrowDown', 40);
  }
  await pressKey(' ', 'Space', 32);
  const keyboardSelection = await evaluate(`(() => {
    const select = document.querySelector('.mapping-dialog select[formcontrolname="physicalColumnIds"]');
    return [...select.selectedOptions].some((option) => option.textContent.includes('logistics.vehicle_inventory.designation_de'));
  })()`);
  invariant(keyboardSelection, 'Keyboard did not select the replacement physical column');
  await waitFor(
    "document.querySelector('.mapping-dialog button[type=\"submit\"]')?.disabled === false",
    'resolved mapping dialog did not apply the keyboard selection',
  );
  await pressKey('Tab', 'Tab', 9);
  const submitFocused = await evaluate(`(() => {
    const button = document.querySelector('.mapping-dialog button[type="submit"]');
    button?.focus();
    return document.activeElement === button && !button.disabled;
  })()`);
  invariant(submitFocused, 'resolved mapping dialog is not keyboard-submittable');
  await pressKey('Enter', 'Enter', 13);
  await waitFor("document.querySelector('.mapping-dialog[open]') === null", 'mapping dialog did not close');
  const saveFocused = await evaluate(`(() => {
    const button = document.querySelector('.draft-save-action>button');
    button?.focus();
    return document.activeElement === button && !button.disabled;
  })()`);
  invariant(saveFocused, 'workspace draft save is not keyboard-submittable');
  await pressKey('Enter', 'Enter', 13);
  try {
    await waitFor("document.body.innerText.includes('versioniert gespeichert')", 'drift resolution successor was not persisted');
  } catch (error) {
    const alerts = await evaluate("[...document.querySelectorAll('.daca-alert[role=alert]')].map((item)=>item.textContent)");
    throw new Error(`${error.message}: ${JSON.stringify(alerts)}`);
  }
  const resolved = expectStatus(
    await api('cinthya.thor', `/api/v1/asset-mappings?logicalModelId=${organizationModelId}`),
    200,
    'read resolved mapping',
  ).body.items.find((item) => item.id === mapping.id);
  invariant(resolved.status === 'draft', `Resolved mapping must return to draft, received ${resolved.status}`);
  invariant(resolved.physicalSnapshotId === currentSnapshotId, 'Resolved mapping does not pin the latest snapshot');
  invariant(resolved.predecessorVersionId === broken.versionId, 'Broken version was not preserved as predecessor');

  await navigate(
    `/models/${organizationModelId}/mappings?physicalSnapshotId=${currentSnapshotId}`,
    'cinthya.thor',
    390,
    844,
  );
  await waitFor("document.querySelector('.mapping-matrix') !== null", 'mobile did not default to the matrix');
  try {
    await waitFor(`(() => [...document.querySelectorAll('.mapping-shell button, .workspace-context select')]
      .filter((element) => element.getClientRects().length > 0)
      .every((element) => element.getBoundingClientRect().height >= 40))()`, 'mobile interactive targets remained too small');
  } catch (error) {
    const targets = await evaluate(`(() => [...document.querySelectorAll('.mapping-shell button, .workspace-context select')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ label: element.textContent.trim().slice(0, 80), height: element.getBoundingClientRect().height }))
      .filter((element) => element.height < 40))()`);
    throw new Error(`${error.message}: ${JSON.stringify(targets)}`);
  }
  const mobile = await evaluate(`(() => {
    const region = document.querySelector('.matrix-region');
    const targets = [...document.querySelectorAll('.mapping-shell button, .workspace-context select')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.getBoundingClientRect().height);
    return {
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      workspaceClientWidth: region.clientWidth,
      workspaceScrollWidth: region.scrollWidth,
      minimumTargetHeight: Math.min(...targets),
    };
  })()`);
  invariant(mobile.pageWidth <= mobile.viewportWidth + 1, `Mobile page overflows by ${mobile.pageWidth - mobile.viewportWidth}px`);
  invariant(mobile.workspaceScrollWidth > mobile.workspaceClientWidth, 'Matrix does not retain its own horizontal workspace scroll');
  invariant(mobile.minimumTargetHeight >= 40, `Interactive target is only ${mobile.minimumTargetHeight}px high`);

  await captureScreenshot('mappings-390x844.png');
  await captureWorkspaceScreenshot('mappings-workspace-390x844.png');
  await navigate(
    `/models/${organizationModelId}/mappings?view=graph&physicalSnapshotId=${currentSnapshotId}`,
    'cinthya.thor',
    1774,
    887,
  );
  await waitFor("document.querySelector('.mapping-graph') !== null", 'desktop graph did not render');
  await captureScreenshot('mappings-1774x887.png');
  await captureWorkspaceScreenshot('mappings-workspace-1774x887.png');
  await navigate(
    `/models/${organizationModelId}/mappings?view=table&physicalSnapshotId=${currentSnapshotId}`,
    'cinthya.thor',
    1440,
    900,
  );
  try {
    await waitFor("document.querySelector('.mapping-matrix') !== null", 'desktop matrix did not render', 25_000);
  } catch (error) {
    const context = await evaluate(`(() => ({
      url: location.href,
      workspace: document.querySelector('.mapping-shell')?.innerText.slice(0, 800),
      alert: [...document.querySelectorAll('[role="alert"]')].map((item) => item.innerText),
    }))()`);
    throw new Error(`${error.message}: ${JSON.stringify(context)}`);
  }
  await captureScreenshot('mappings-1440x900.png');
  await captureWorkspaceScreenshot('mappings-workspace-1440x900.png');
  await navigate('/models', 'cinthya.thor', 1774, 887);
  await waitFor("document.querySelector('.model-list') !== null", 'logical-model overview did not render');
  await captureScreenshot('models-1774x887.png');
  return { mappingId: mapping.id, currentSnapshotId, mobile };
}

try {
  const browser = await connectBrowser();
  cdp = new CdpClient(browser.webSocketDebuggerUrl);
  await cdp.ready;
  const target = await cdp.call('Target.createTarget', { url: 'about:blank' });
  const attached = await cdp.call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await cdp.call('Page.enable', {}, sessionId);
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
    source: `try {
      const user = new URL(location.href).searchParams.get('demoUser');
      if (user) localStorage.setItem('daca.preference.' + user + '.language', 'de');
    } catch {}`,
  }, sessionId);
  await cdp.call('Runtime.enable', {}, sessionId);
  await cdp.call('Network.enable', {}, sessionId);
  await cdp.call('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.call('Network.setBypassServiceWorker', { bypass: true }, sessionId);

  if(args.get('--flow')==='csv-import'){await csvPhysicalModelsFlow();} else if(args.get('--flow')==='concept-network'){await conceptNetworkEditingFlow();} else if(args.get('--flow')==='line-editing'){
    invariant(args.get('--model-id')&&args.get('--snapshot-id'),'line-editing flow requires model-id and snapshot-id');
    await edgeEditingFlow({modelId:args.get('--model-id'),snapshotId:args.get('--snapshot-id')});
  } else {
  await csvPhysicalModelsFlow();
  const logical = await logicalFirstFlow();
  console.log(`PASS logical-first: ${logical.modelId}`);
  const physical = await physicalFirstFlow();
  await edgeEditingFlow(physical);
  console.log(`PASS physical-first: ${physical.modelId} @ ${physical.snapshotId}`);
  const domainAssignment = await domainAssignmentFlow(physical);
  console.log(`PASS domain-assignment: ${domainAssignment.modelId}`);
  await personnelOntologyFlow();
  await conceptNetworkEditingFlow();
  const existing = await existingToExistingFlow(physical);
  console.log(`PASS existing-to-existing: ${existing.mappingId} @ ${existing.currentSnapshotId}`);
  console.log(`PASS mobile: ${JSON.stringify(existing.mobile)}`);
  const journeyTen = await dataModelJourneyTen();
  console.log(`PASS journey-10: ${journeyTen.modelId}`);
  }
} finally {
  try {
    if (cdp) await cdp.call('Browser.close');
  } catch {}
  if (!edge.killed) edge.kill();
  const temporaryRoot = path.resolve(tmpdir());
  const resolvedProfile = path.resolve(profileDirectory);
  if (resolvedProfile.startsWith(`${temporaryRoot}${path.sep}daca-edge-e2e-`)) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
}

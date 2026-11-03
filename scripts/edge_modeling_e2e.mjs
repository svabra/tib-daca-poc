#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = (args.get('--base-url') ?? process.env.DACA_UI_REGRESSION_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
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
    this.httpFailures = [];
    this.runtimeExceptions = [];
    this.loadedLoaders = new Set();
    this.dialogs = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('close', () => {for(const pending of this.pending.values())pending.reject(new Error('Browser connection closed'));this.pending.clear();});
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if(message.method==='Runtime.exceptionThrown')this.runtimeExceptions.push(message.params.exceptionDetails);
      if(args.get('--trace') && message.method==='Runtime.exceptionThrown')console.log('Browser exception:',JSON.stringify(message.params.exceptionDetails));
      if(args.get('--trace')&&message.method==='Network.requestWillBeSent'&&message.params.request.url.includes('/api/v1/'))console.log('Browser read:',new Date().toISOString(),message.params.request.url);
      if(message.method==='Fetch.requestPaused'){
        if(this.deferReadPaths){
          if(this.deferReadPaths.has(new URL(message.params.request.url).pathname)){
            (this.deferredGenericReads??=[]).push({requestId:message.params.requestId,sessionId:message.sessionId,path:new URL(message.params.request.url).pathname});
          }else void this.call('Fetch.continueRequest',{requestId:message.params.requestId},message.sessionId);
          return;
        }
        if(this.deferLogicalReads&&new URL(message.params.request.url).pathname==='/api/v1/logical-models'){
          (this.deferredLogicalReads??=[]).push({requestId:message.params.requestId,sessionId:message.sessionId});return;
        }
        if(this.mockReadResponses){
          const fixture=this.mockReadResponses.get(new URL(message.params.request.url).pathname);
          const response=typeof fixture==='function'?fixture(message.params.request):fixture;
          const command=response?this.call('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(response)).toString('base64')},message.sessionId):this.call('Fetch.continueRequest',{requestId:message.params.requestId},message.sessionId);
          void command.catch(error=>{this.interceptionError=error.message;});return;
        }
        const mock=this.mockTransferResponse;
        this.interceptedTransfers??=[];this.interceptedTransfers.push(message.params.request);
        const command=mock?this.call('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:mock.status,responseHeaders:[{name:'Content-Type',value:'application/problem+json'}],body:Buffer.from(JSON.stringify(mock.body)).toString('base64')},message.sessionId):this.call('Fetch.failRequest',{requestId:message.params.requestId,errorReason:'Aborted'},message.sessionId);
        void command.catch(async error=>{this.interceptionError=error.message;try{await this.call('Fetch.failRequest',{requestId:message.params.requestId,errorReason:'Aborted'},message.sessionId);}catch{/* Closing the isolated browser cancels any remaining paused request. */}});
      }
      if(message.method==='Page.javascriptDialogOpening'){
        this.dialogs.set(message.sessionId,message.params.type);
        if(['canvas-selection','canvas-card-styles'].includes(args.get('--flow'))&&message.params.type==='beforeunload')void this.call('Page.handleJavaScriptDialog',{accept:true},message.sessionId).catch(()=>{});
        if(args.get('--trace'))console.log('Native browser dialog:',message.params.type);
      }
      if(message.method==='Page.javascriptDialogClosed')this.dialogs.delete(message.sessionId);
      if(message.method==='Page.lifecycleEvent'&&message.params.name==='load')this.loadedLoaders.add(message.params.loaderId);
      if(message.method==='Network.responseReceived'&&message.params.response.status>=400){
        const response=message.params.response,path=new URL(response.url).pathname;
        if(path.startsWith('/api/'))this.httpFailures.push({path,status:response.status});
        this.httpFailures=this.httpFailures.slice(-20);
      }
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
      const timeoutError=new Error(`${method}: browser command timed out`);
      const timer=setTimeout(()=>{this.pending.delete(id);timeoutError.message+=this.dialogs.has(sessionId)?` (${this.dialogs.get(sessionId)} dialog open)`:'';reject(timeoutError);},30_000);
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
  // Keep machine-installed extensions out of the isolated application regression.
  '--disable-extensions',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
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

async function settleFrames() {
  // Headless Edge can suspend frame callbacks after leaving fullscreen. DOM readiness
  // is checked separately; settling the paint must not hang the browser command.
  await evaluate('new Promise(resolve=>{const fallback=setTimeout(resolve,200);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(fallback);resolve();}));})');
}

// Workspace readiness can span a 30s collection read followed by an 8s detail read.
async function waitFor(expression, message, timeout = 45_000) {
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
  const state = await evaluate(`(() => ({url:location.pathname,profile:document.querySelector('a[href="/profile"]')?.textContent,
    documentFocused:document.hasFocus(),activeElement:document.activeElement?.outerHTML.slice(0,500),
    pageText:document.body.innerText.slice(0,4000),alerts:[...document.querySelectorAll('[role="alert"]')].map(item=>item.textContent.slice(0,500)),
    dialogs:[...document.querySelectorAll('dialog[open]')].map(item=>item.innerText.slice(0,800))}))()`);
  throw new Error(`${message}${lastError ? ` (${lastError.message})` : ''}: ${JSON.stringify({...state,httpFailures:cdp.httpFailures})}`);
}

async function waitForWorkspaceSave(message) {
  // A previous success announcement may still be present while the next save is in flight.
  await waitFor("(() => {const button=document.querySelector('.draft-save-action>button');return button?.disabled&&button.textContent.trim()==='Entwurf speichern'&&document.body.innerText.includes('Alle Mapping-Entwürfe wurden versioniert gespeichert');})()", message);
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
    format: filename.endsWith('.webp') ? 'webp' : 'png',
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
    format: filename.endsWith('.webp') ? 'webp' : 'png',
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
  const expectedPath = url.pathname === '/domains/network' ? '/domains' : url.pathname;
  if (actor) url.searchParams.set('demoUser', actor);
  // Establish the test identity before bootstrapping the next page. The
  // demoUser query is a UI shortcut and may be cleaned up during startup.
  if(actor&&await evaluate('location.origin')===new URL(baseUrl).origin){
    const current=await api(actor,'/api/v1/session');
    if(current.status!==200||current.body.userId!==actor){
      expectStatus(await api(actor,'/api/v1/session/login',{method:'POST',body:{userId:actor}}),200,'select local test session');
    }
  }
  await setViewport(width, height);
  await cdp.call('Page.bringToFront', {}, sessionId);
  const navigation=await cdp.call('Page.navigate', { url: url.href }, sessionId);
  if(navigation.loaderId){
    const deadline=Date.now()+15_000;
    while(!cdp.loadedLoaders.has(navigation.loaderId)&&Date.now()<deadline)await sleep(80);
    invariant(cdp.loadedLoaders.has(navigation.loaderId),`Page did not finish loading: ${url.pathname}`);
  }
  await waitFor(
    `location.pathname===${JSON.stringify(expectedPath)}&&document.readyState === 'complete' && !!document.querySelector('daca-root router-outlet')?.nextElementSibling`,
    `Angular page did not load: ${url.href}`,
  );
  await waitFor(
    "!document.body.innerText.includes('werden geladen') && !document.body.innerText.includes('wird geladen')",
    `Angular page remained in a loading state: ${url.href}`,
  );
  if (actor) await waitFor(`(async () => {const response=await fetch('/api/v1/session');return response.ok&&(await response.json()).userId===${JSON.stringify(actor)}&&localStorage.getItem('daca-demo-user')===${JSON.stringify(actor)};})()`, 'local preview sign-in did not finish for the requested actor');
  await evaluate("document.fonts?.ready ?? Promise.resolve()");
  await settleFrames();
  // Inventory/layout flows intentionally include empty organizations. The live
  // default and its toolbar controls are covered by organization-view-options.
  if(['organization-explorer','organization-layout','organization-domain-layout','organization-heading-space','organization-object-search','organization-localization','canvas-selection','canvas-controls'].includes(args.get('--flow'))){
    await evaluate("document.querySelector('[data-hide-unrelated-switch][aria-checked=\"true\"]')?.click()");await settleFrames();
  }
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
  await waitFor(`${JSON.stringify(Object.keys(values))}.every(selector=>document.querySelector(selector)!==null)`,'Form controls did not become ready');
  await waitFor(`Object.entries(${JSON.stringify(values)}).every(([selector,value])=>{const element=document.querySelector(selector);return element?.tagName!=='SELECT'||[...element.options].some(option=>option.value===String(value));})`,'Select options did not finish loading');
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
  await waitFor(`(() => {const target=[...document.querySelectorAll(${JSON.stringify(selector)})].find(element=>element.textContent.trim().includes(${JSON.stringify(text)}));return target&&!target.disabled;})()`, `Action did not become available: ${selector} containing ${text}`);
  const clicked = await evaluate(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((element) => element.textContent.trim().includes(${JSON.stringify(text)}));
    if (!target || target.disabled) return false;
    target.click();
    return true;
  })()`);
  invariant(clicked, `Could not activate ${selector} containing “${text}”`);
}

async function controlClick(selector, text = null) {
  const element=`[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>${text===null?'true':`item.textContent.includes(${JSON.stringify(text)})`})`;
  await waitFor(`${element}!==undefined`,'Control-click target missing: '+selector);
  await evaluate(`${element}.scrollIntoView({block:'center',behavior:'instant'})`);await settleFrames();
  const point=await evaluate(`(()=>{const r=${element}.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await cdp.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,modifiers:2},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,modifiers:2},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,modifiers:2,clickCount:1},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,modifiers:2,clickCount:1},sessionId);
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,modifiers:0},sessionId);
}

async function openSourceCardMenu(sourceId) {
  const selector = JSON.stringify(`.source-card[data-source-id="${sourceId}"] .source-actions-trigger`);
  await waitFor(`document.querySelector(${selector}) !== null`, 'source actions trigger unavailable');
  await evaluate(`(() => {const trigger=document.querySelector(${selector});trigger.scrollIntoView({block:'center'});if(trigger.getAttribute('aria-expanded')!=='true')trigger.click();})()`);
  await waitFor(`document.querySelector(${JSON.stringify(`.source-card[data-source-id="${sourceId}"] [role=menu]`)}) !== null`, 'source actions menu did not open');
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

async function customerModelingFixesFlow() {
  const actor='christian.man',stamp=Date.now(),fieldName=`customer_field_${stamp}`;
  await navigate('/models',actor);
  const reference=expectStatus(await api(actor,'/api/v1/logical-models/83cb48b4-32b4-5bc9-b613-1036c3cb2e77'),200,'read modelling scope').body;
  const contentBase64=Buffer.from(`Tabelle;Feldname;Datentyp;Kurzbeschreibung\nCustomerModel${stamp};${fieldName};;Synthetic missing type regression\nCustomerModel${stamp};second_field;CHAR;Second logical field\n`,'utf8').toString('base64');
  const preview=expectStatus(await api(actor,'/api/v1/physical-model-csv/preview',{method:'POST',body:{contentBase64}}),200,'preview missing datatype').body;
  invariant(preview.tables[0].columns[0].normalizedDataType==='string'&&preview.warnings.some(item=>item.includes('als string angenommen')),'missing CSV type did not default to string');
  const imported=expectStatus(await api(actor,'/api/v1/physical-model-csv/imports',{method:'POST',body:{contentBase64,fingerprint:preview.fingerprint,name:`Customer modelling QA ${stamp}`,filename:'customer-model-qa.csv',departmentCode:reference.departmentCode,organizationId:reference.organizationId}}),201,'import missing datatype').body;
  try {
    const table=imported.snapshot.databases[0].schemas[0].tables[0];
    const derivation={title:`Customer logical QA ${stamp}`,description:'Synthetic regression for saved field representations and search.',dataDomainId:reference.dataDomainId,dataOwnerUserId:reference.dataOwnerUserId,deputyOwnerUserId:reference.deputyOwnerUserId};
    const proposed=expectStatus(await api(actor,`/api/v1/physical-tables/${table.id}/derivation-preview`,{method:'POST',body:derivation}),200,'derive string proposal').body;
    invariant(proposed.fields[0].dataType==='string','derivation discarded the assumed string type');
    const model=expectStatus(await api(actor,`/api/v1/physical-tables/${table.id}/derive-logical-model`,{method:'POST',body:{...derivation,fields:proposed.fields}}),201,'save derived logical model').body;
    const fields=model.entities.flatMap(entity=>entity.fields);
    const mappings=expectStatus(await api(actor,`/api/v1/asset-mappings?logicalModelId=${model.id}`),200,'read saved customer mappings').body.items;
    for(const mapping of mappings){
      const validated=expectStatus(await api(actor,`/api/v1/asset-mappings/${mapping.id}/versions/${mapping.versionId}/validate`,{method:'POST',etag:`"${mapping.lockVersion}"`}),200,'validate assumed-string mapping').body;
      invariant(validated.validationResult.valid,'assumed-string mapping failed validation');
    }
    await navigate(`/models/${model.id}?selectedFieldId=${fields[1].id}`,actor);
    await waitFor("document.querySelector('#model-panel-fields')?.hidden===false&&document.querySelector('.field-table tr.is-selected')?.innerText.includes('second_field')",'logical field deep link did not select the requested field');
    await clickText('.field-browser nav button','Relation');
    await waitFor(`document.querySelector('.relation-list button')?.innerText.includes(${JSON.stringify(fieldName)})&&!document.querySelector('.relation-list button')?.innerText.includes('werden geladen')`,'persisted physical relation was not restored');
    invariant(await evaluate("!document.querySelector('.relation-list')?.innerText.includes('Keine Repräsentation')"),'saved field mapping was reported as absent');
    await capturePageSegmentScreenshot('#model-panel-fields','customer-saved-relations.png');
    const search=`/search?q=${fieldName}&kind=field&organization=${encodeURIComponent(model.organizationId)}&domain=${encodeURIComponent(model.dataDomainId)}`;
    await navigate(search,actor);
    await waitFor(`document.querySelector('[data-search-key="logical-field:${model.id}:${fields[0].rootId||fields[0].id}"]')!==null`, 'logical field not found with organization and domain filters',60_000);
    invariant(await evaluate(`document.querySelector('[data-search-key^="logical-field:${model.id}:"] .search-row-kind')?.textContent==='Logisches Feld'`),'logical field was labelled as a physical column');
    await capturePageSegmentScreenshot('.catalog-search','customer-logical-field-search.png');
    await evaluate(`document.querySelector('[data-search-key^="logical-field:${model.id}:"] a').click()`);
    await waitFor(`location.pathname==='/models/${model.id}'&&document.querySelector('#model-panel-fields')?.hidden===false&&document.querySelector('.field-table tr.is-selected')?.innerText.includes(${JSON.stringify(fieldName)})`,'search result did not open the exact logical field');
    console.log('PASS customer modelling fixes: missing CSV type, derived string mapping, restored relations, scoped logical field search and direct field navigation');
  } finally {
    const source=expectStatus(await api(actor,'/api/v1/physical-sources'),200,'read only customer QA inventory').body.items.find(item=>item.id===imported.sourceId);
    if(source)expectStatus(await api(actor,`/api/v1/structure-inventories/${source.id}/archive`,{method:'POST',etag:`"${source.revision}"`}),200,'archive only customer QA inventory');
  }
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
  async function selectFile(drop = false) {
    await waitFor("document.querySelector('.csv-import-trigger') && !document.querySelector('.csv-import-trigger').disabled", 'CSV loader entry not ready after navigation');
    await evaluate("document.querySelector('.csv-import-trigger').focus({preventScroll:true})");
    await clickText('.csv-import-trigger', 'CSV');
    await waitFor("document.querySelector('daca-physical-csv-import dialog')?.open", 'CSV dialog did not open');
    invariant(await evaluate("(()=>{const fields=[...document.querySelectorAll('.import-inputs input,.import-inputs select')].map(input=>input.getBoundingClientRect());return fields.length===2&&fields.every(rect=>rect.height>=40&&rect.height<=56)&&Math.abs(fields[0].top-fields[1].top)<1&&getComputedStyle(document.querySelector('.csv-file-input')).display==='none'&&!!document.querySelector('.csv-file-select');})()"),'CSV upload does not use a custom file button and aligned compact fields');
    await capturePageSegmentScreenshot('daca-physical-csv-import dialog[open]','csv-upload-desktop-empty.png');
    if (!suppliedFile) await setControls({'daca-physical-csv-import .import-inputs select':'vbs-verteidigung'});
    if (drop) {
      const point = await evaluate("(()=>{const r=document.querySelector('.csv-drop-zone').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
      const data = {items:[], files:[file], dragOperationsMask:1};
      await cdp.call('Input.dispatchDragEvent', {type:'dragEnter', ...point, data}, sessionId);
      await cdp.call('Input.dispatchDragEvent', {type:'dragOver', ...point, data}, sessionId);
      await waitFor("document.querySelector('.csv-drop-zone.is-dragging')", 'CSV drop target did not highlight');
      await cdp.call('Input.dispatchDragEvent', {type:'drop', ...point, data}, sessionId);
    } else {
      const {root} = await cdp.call('DOM.getDocument', {}, sessionId);
      const {nodeId} = await cdp.call('DOM.querySelector', {nodeId: root.nodeId, selector:'daca-physical-csv-import input[type=file]'}, sessionId);
      await cdp.call('DOM.setFileInputFiles', {nodeId, files:[file]}, sessionId);
    }
    await waitFor(`document.querySelector('.preview-count')?.textContent.includes('${expected.tableCount} physische Modelle')`, 'CSV preview did not load');
  }
  try {
    await selectFile(true);
    invariant(await evaluate("document.querySelector('.preview-count').textContent.includes('physische Modelle (Physische Repräsentation)')"),'physical representation explanation missing');
    await capturePageSegmentScreenshot('daca-physical-csv-import dialog[open]','csv-upload-desktop-preview.png');
    await setViewport(390,844);await settleFrames();
    await evaluate("document.querySelector('daca-physical-csv-import dialog').scrollTop=0");
    invariant(await evaluate("(()=>{const dialog=document.querySelector('daca-physical-csv-import dialog'),zone=document.querySelector('.csv-drop-zone').getBoundingClientRect(),button=document.querySelector('.csv-file-select').getBoundingClientRect();return dialog.scrollWidth<=dialog.clientWidth+1&&button.left>=zone.left&&button.right<=zone.right;})()"),'CSV upload overflows its mobile dialog');
    await captureScreenshot('csv-upload-mobile-preview.png');
    await setViewport(1440,900);await settleFrames();
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
    if (!suppliedFile) {
      // Exercise lifecycle actions only on this run's synthetic inventory.
      await navigate('/physical-models', actor);
      const card = `.source-card[data-source-id="${sourceId}"]`;
      await waitFor(`document.querySelector(${JSON.stringify(card)})?.innerText.includes('Physische Deklaration')`, 'Inventory terminology missing');
      await clickText(`${card} .source-actions-trigger`, '');
      await clickText(`${card} .source-actions-menu button`, 'Archivieren');
      await waitFor("document.querySelector('daca-structure-inventory-actions dialog[open]')", 'Archive confirmation missing');
      await clickText('daca-structure-inventory-actions dialog[open] footer button', 'Inventar archivieren');
      await waitFor(`!document.querySelector(${JSON.stringify(card)})`, 'Archived inventory remained in active register');
      await evaluate("document.querySelector('.archive-toggle input').click()");
      await waitFor(`document.querySelector(${JSON.stringify(card)})?.classList.contains('is-archived')`, 'Archive filter did not expose inventory');
      await capturePageSegmentScreenshot('.source-register', 'structure-inventory-archived.png');
      await openSourceCardMenu(sourceId);
      await clickText(`${card} a`, 'Inventar öffnen');
      await waitFor(`document.querySelector('.inventory-detail-actions') && document.querySelectorAll('.table-row').length===${expected.tableCount}`, 'Archived inventory inspection unavailable');
      await clickText('.table-select', 'Gebäude / Bauwerke');
      await waitFor("document.querySelector('daca-physical-object-detail h2')", 'Archived object inspection unavailable');
      invariant(await evaluate("document.body.innerText.includes('Archiviert')"), 'Archive status missing in inspector');
      await clickText('.inventory-detail-actions daca-structure-inventory-actions button', 'Wiederherstellen');
      await clickText('daca-structure-inventory-actions dialog[open] footer button', 'Inventar wiederherstellen');
      await waitFor("!document.querySelector('daca-structure-inventory-actions dialog[open]') && [...document.querySelectorAll('.inventory-detail-actions button')].some(b=>b.textContent==='Archivieren')", 'Inventory restoration failed');
      await navigate('/physical-models', actor);
      await waitFor(`document.querySelector(${JSON.stringify(card)})`, 'Restored inventory absent from active register');
      await clickText(`${card} .source-actions-trigger`, '');
      await clickText(`${card} .source-actions-menu button`, 'Löschen');
      await clickText('daca-structure-inventory-actions dialog[open] footer button', 'Abbrechen');
      invariant(expectStatus(await api(actor, '/api/v1/physical-sources'), 200, 'inventory after cancelled deletion').body.items.some(s=>s.id===sourceId), 'Cancel deleted inventory');
      await clickText(`${card} .source-actions-trigger`, '');
      await clickText(`${card} .source-actions-menu button`, 'Löschen');
      await clickText('daca-structure-inventory-actions dialog[open] footer button', 'Inventar endgültig löschen');
      await waitFor(`!document.querySelector(${JSON.stringify(card)})`, 'Deleted inventory remained in register');
      await navigate('/physical-models', actor);
      await waitFor("document.querySelector('daca-structure-inventory-audit button')", 'Inventory audit entry missing');
      await clickText('daca-structure-inventory-audit button', 'Inventarprotokoll');
      await waitFor("[...document.querySelectorAll('daca-structure-inventory-audit tbody tr')].some(r=>r.innerText.includes('Gebaeude-QA')&&r.innerText.includes('Gelöscht')&&r.innerText.includes('christian.spider'))", 'Deleted inventory audit unavailable after reload');
      await captureScreenshot('structure-inventory-audit.png');
      await clickText('daca-structure-inventory-audit footer button', 'Schliessen');
    }
    console.log(`PASS csv-physical-models: ${expected.tableCount} tables / ${expected.fieldCount} fields @ ${sourceId}`);
  } finally {
    if (sourceId && !suppliedFile) {
      const sources=expectStatus(await api(actor,'/api/v1/physical-sources?includeArchived=true'),200,'find QA CSV source').body.items;
      const source=sources.find(item=>item.id===sourceId);
      if(source) expectStatus(await api(actor,`/api/v1/structure-inventories/${sourceId}`,{method:'DELETE',etag:`"${source.revision}"`}),204,'delete only the QA CSV source');
    }
  }
}

async function adaImportJourneyFlow() {
  const actor='christian.man',scope={departmentCode:'VBS',organizationId:'vbs-verteidigung'};
  const statusRoute='/api/v1/import-journeys/ada?departmentCode=VBS&organizationId=vbs-verteidigung';
  const file=path.join(profileDirectory,'ada_bewirtschaftung.csv');
  await navigate('/models',actor);
  await waitFor("document.querySelector('.csv-import-trigger')",'CSV import entry missing');
  invariant(await evaluate("!document.querySelector('.journey-menu-trigger')"),'Journey menu leaked onto the models page');
  await navigate('/documentation/journeys',actor);
  invariant(expectStatus(await api(actor,statusRoute),200,'AdA journey baseline').body.source===null,
    'AdA journey test requires an empty example scope; refusing to reset a pre-existing inventory');
  const originalIds=expectStatus(await api(actor,'/api/v1/physical-sources'),200,'sources before AdA journey').body.items.map(s=>s.id).sort();
  await setControls({'#poc-guide-query':'AdA CSV'});
  await waitFor("document.querySelectorAll('[data-poc-guide-journey]').length===1&&document.querySelector('[data-poc-guide-journey]').getAttribute('data-poc-guide-journey')==='import-physical-model-ada'",'AdA journey missing from searchable guide');
  invariant(await evaluate("!!document.querySelector('#journey-import-physical-model-ada daca-physical-import-journey')&&!document.querySelector('a daca-physical-import-journey')"),'AdA menu is not a separate control on its journey tile');
  await clickText('[data-poc-guide-journey="import-physical-model-ada"]','');
  await waitFor("document.querySelectorAll('[data-poc-guide-step]').length===6&&document.querySelector('h1')?.textContent.includes('AdA')",'AdA step-by-step guide is missing');
  await clickText('.poc-guide-heading-tools .journey-menu-trigger','');
  await waitFor("document.querySelector('.poc-guide-heading-tools .journey-menu a')",'AdA detail header menu missing');
  invariant(await evaluate("document.querySelector('.poc-guide-heading-tools .journey-menu a').getAttribute('href')==='/api/v1/import-journeys/ada/inventory.csv'"),'AdA detail download missing');
  await setViewport(412,915);
  invariant(await evaluate("(()=>{const r=document.querySelector('.poc-guide-heading-tools .journey-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1;})()"),'AdA detail menu overflows mobile viewport');
  await captureScreenshot('ada-journey-detail-menu-mobile.png');
  await setViewport(1440,900);
  await captureScreenshot('ada-journey-detail.png');
  await navigate('/documentation/journeys',actor);await setControls({'#poc-guide-query':'AdA CSV'});
  await waitFor("document.querySelector('.journey-menu-trigger')&&!document.querySelector('.journey-menu-trigger').disabled",'AdA journey menu missing');
  await evaluate("document.querySelector('#journey-import-physical-model-ada').scrollIntoView({block:'center'})");
  await cdp.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:profileDirectory});
  await clickText('.journey-menu-trigger','');
  invariant(await evaluate("document.querySelector('.journey-menu a')?.getAttribute('href')==='/api/v1/import-journeys/ada/inventory.csv'"),'AdA download target missing');
  await captureScreenshot('ada-journey-menu.png');
  await setViewport(412,915);
  invariant(await evaluate("(()=>{const r=document.querySelector('.journey-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1;})()"),'AdA menu overflows the mobile viewport');
  await captureScreenshot('ada-journey-menu-mobile.png');
  await setViewport(1440,900);
  await clickText('.journey-menu a','herunterladen');
  let bytes;
  for(let attempt=0;attempt<60;attempt++){
    try{bytes=await readFile(file);break;}catch{await sleep(120);}
  }
  invariant(bytes?.length>0,'AdA CSV was not downloaded from the menu');
  const preview=expectStatus(await api(actor,'/api/v1/physical-model-csv/preview',{method:'POST',body:{contentBase64:bytes.toString('base64')}}),200,'downloaded AdA CSV').body;
  invariant(preview.tableCount===11&&preview.fieldCount===62,'Downloaded example inventory changed unexpectedly');
  await navigate('/physical-models',actor);
  await waitFor("document.querySelector('.csv-import-trigger')",'Source CSV import entry missing');
  invariant(await evaluate("!document.querySelector('.journey-menu-trigger')"),'Journey menu leaked onto the sources page');
  async function importExample(){
    await clickText('.csv-import-trigger','CSV');
    await waitFor("document.querySelector('daca-physical-csv-import dialog')?.open",'AdA CSV importer missing');
    await setControls({'daca-physical-csv-import .import-inputs select':scope.organizationId});
    const {root}=await cdp.call('DOM.getDocument',{},sessionId);
    const {nodeId}=await cdp.call('DOM.querySelector',{nodeId:root.nodeId,selector:'daca-physical-csv-import input[type=file]'},sessionId);
    await cdp.call('DOM.setFileInputFiles',{nodeId,files:[file]},sessionId);
    await waitFor("document.querySelector('.preview-count')?.textContent.includes('62 eindeutige Felder')",'Downloaded AdA CSV did not preview');
    await clickText('daca-physical-csv-import footer button','Importieren');
    await waitFor("location.pathname.startsWith('/physical-models/')&&document.querySelectorAll('.table-row').length===11",'AdA inventory did not import');
    return expectStatus(await api(actor,statusRoute),200,'AdA imported state').body.source;
  }
  let created;
  try{
    created=await importExample();
    const firstSnapshot=created.latestSnapshotId;
    await navigate('/documentation/journeys',actor);await setControls({'#poc-guide-query':'AdA CSV'});
    await waitFor("document.querySelector('#journey-import-physical-model-ada .journey-menu-trigger')",'Journey menu missing from AdA tile');
    await clickText('.journey-menu-trigger','');await clickText('.journey-menu button','zurücksetzen');
    await setControls({'daca-physical-import-journey dialog select':scope.organizationId});
    await waitFor("document.querySelector('daca-physical-import-journey dialog[open] .reset-target')",'Reset confirmation target did not load');
    await captureScreenshot('ada-journey-reset-confirmation.png');
    await clickText('daca-physical-import-journey dialog footer button','Abbrechen');
    invariant(expectStatus(await api(actor,statusRoute),200,'AdA cancelled reset').body.source.id===created.id,'Cancelling reset removed inventory');
    await navigate('/documentation/journeys/import-physical-model-ada',actor);
    await waitFor("document.querySelector('.poc-guide-heading-tools .journey-menu-trigger')",'AdA detail reset menu missing');
    await clickText('.journey-menu-trigger','');await clickText('.journey-menu button','zurücksetzen');
    await setControls({'daca-physical-import-journey dialog select':scope.organizationId});
    await waitFor("document.querySelector('daca-physical-import-journey dialog[open] .reset-target')",'Reset confirmation target missing');
    await clickText('daca-physical-import-journey dialog footer button','Beispielimport zurücksetzen');
    await waitFor("document.querySelector('daca-physical-csv-import dialog')?.open&&!document.querySelector('.preview-count')",'Reset did not reopen an empty importer');
    invariant(await evaluate("document.querySelector('daca-physical-csv-import input[type=file]').value===''&&document.querySelector('.import-inputs select').value==='vbs-verteidigung'"),'Reset retained a file or lost organization');
    invariant(expectStatus(await api(actor,statusRoute),200,'AdA reset state').body.source===null,'Confirmed reset retained inventory');
    await clickText('daca-physical-csv-import dialog footer button','Abbrechen');
    await waitFor(`!document.querySelector('.source-card[data-source-id="${created.id}"]')`,'Source register retained reset inventory');
    created=await importExample();
    invariant(created.latestSnapshotId!==firstSnapshot&&created.revision>1,'Reimport reused obsolete snapshot/revision');
    async function cli(confirmed){
      const command=['run','--all-packages','python','-m','daca_catalog.import_journey_cli','--base-url',baseUrl,'--demo-user',actor];
      if(confirmed)command.push('--yes');
      return new Promise((resolve,reject)=>{
        const child=spawn('uv',command,{windowsHide:true});let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
        child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(`AdA reset CLI failed: ${output}`)));
      });
    }
    invariant((await cli(false)).includes('Erst --yes'),'CLI did not preview before confirmation');
    invariant(expectStatus(await api(actor,statusRoute),200,'AdA after CLI preview').body.source!==null,'CLI preview removed inventory');
    invariant((await cli(true)).includes('wurde zurückgesetzt'),'CLI reset failed');
    invariant((await cli(true)).includes('bereits zurückgesetzt'),'CLI reset was not idempotent');
    const after=expectStatus(await api(actor,'/api/v1/physical-sources'),200,'sources after AdA reset').body.items.map(s=>s.id).sort();
    invariant(JSON.stringify(after)===JSON.stringify(originalIds),'AdA reset changed unrelated sources');
    console.log('PASS AdA journey: menu download, scoped cancellation/reset, blank importer, fresh reimport, CLI preview/reset/idempotence and unrelated-source preservation');
  } finally {
    if(created){
      const current=expectStatus(await api(actor,statusRoute),200,'AdA test cleanup status').body.source;
      if(current)expectStatus(await api(actor,'/api/v1/import-journeys/ada/reset',{method:'POST',body:scope,etag:`"${current.revision}"`}),200,'reset only test-created AdA inventory');
    }
  }
}

async function inventoryRepresentationFlow() {
  const actor='christian.man',stamp=Date.now(),sourceName=`Inventory scope QA ${stamp}`;
  await navigate('/models',actor);
  const reference=expectStatus(await api(actor,'/api/v1/logical-models/83cb48b4-32b4-5bc9-b613-1036c3cb2e77'),200,'read inventory model reference').body;
  const contentBase64=Buffer.from(`Tabelle;Feldname;Datentyp;Kurzbeschreibung\nVEHICLE;VEHICLE_ID;CHAR;Synthetic inventory ${stamp}\n`,'utf8').toString('base64');
  const preview=expectStatus(await api(actor,'/api/v1/physical-model-csv/preview',{method:'POST',body:{contentBase64}}),200,'preview cross-organization inventory').body;
  const imported=expectStatus(await api(actor,'/api/v1/physical-model-csv/imports',{method:'POST',body:{contentBase64,fingerprint:preview.fingerprint,name:sourceName,filename:'inventory-scope-qa.csv',departmentCode:'VBS',organizationId:'vbs-armasuisse-immobilien'}}),201,'import cross-organization inventory').body;
  try {
    const created=expectStatus(await api(actor,'/api/v1/logical-models',{method:'POST',body:{
      identifiers:[`INVENTORY-SCOPE-QA-${stamp}`],localizations:[{language:'de',title:sourceName,description:'Synthetic inventory scope regression.'}],
      dataOwnerUserId:reference.dataOwnerUserId,deputyOwnerUserId:reference.deputyOwnerUserId,creator:{type:'Application',applicationName:'Inventory QA'},dataDomainId:null,
      organizationUnitId:reference.organizationId,dataClassification:'internal',dateCreated:new Date().toISOString().slice(0,10),contactPoints:[{name:'Inventory QA',email:'inventory@example.test'}],publisher:reference.publisher,
      accessRights:'urn:daca:access-rights:internal',entities:[{name:'vehicle_inventory',businessObject:'Fahrzeug',fields:[{name:'vehicle_id',dataType:'uuid',shortDescription:'Synthetic vehicle key',businessObject:'Fahrzeug',classification:'internal',nullable:false,minCount:1,maxCount:1}]}]
    }}),201,'create inventory representation model');
    invariant(created.body.organizationId!=='vbs-armasuisse-immobilien','inventory scope regression requires distinct organizations');
    const route=`/models/${created.body.id}/mappings`;
    await navigate(route,actor);
    await waitFor("document.querySelector('.logical-node>header') !== null",'empty inventory model canvas unavailable',25_000);
    await evaluate("document.querySelector('.logical-node>header').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:300}))");
    await clickText('.canvas-context-menu button','Neue physische Repräsentation');
    await waitFor(`(() => {const button=[...document.querySelectorAll('.source-options button')].find(b=>b.textContent.includes(${JSON.stringify(sourceName)}));return button&&!button.disabled;})()`,'authorized inventory from another organization is disabled');
    await clickText('.source-options button',sourceName);
    await waitFor("document.querySelector('.representation-dialog .object-tree button')",'inventory tables unavailable in picker');
    await clickText('.representation-dialog .object-tree button','VEHICLE');
    await waitFor("document.querySelector('.representation-dialog daca-physical-object-detail')?.innerText.includes('VEHICLE_ID')",'inventory field inspection unavailable');
    await capturePageSegmentScreenshot('.representation-dialog','inventory-cross-organization-picker.png');
    await clickText('.representation-dialog footer button','Hinzufügen');
    await waitFor("document.querySelectorAll('.physical-representation').length===1&&document.querySelector('.mapping-edge .edge-hit')",'inventory representation and automatic draft link missing');
    await clickText('.draft-save-action>button','Entwurf speichern');
    await waitForWorkspaceSave('cross-organization inventory could not be saved');
    await navigate(route,actor);
    await waitFor("document.querySelectorAll('.physical-representation').length===1&&document.querySelector('.mapping-edge .edge-hit')",'cross-organization inventory did not survive reload');
    await capturePageSegmentScreenshot('.mapping-shell','inventory-cross-organization-saved.png');
    const mappings=expectStatus(await api(actor,`/api/v1/asset-mappings?logicalModelId=${created.body.id}`),200,'read persisted inventory mapping').body.items;
    invariant(mappings.length===1&&mappings[0].physicalSnapshotId===imported.snapshot.snapshot.id&&mappings[0].status==='draft','inventory mapping lost its source snapshot or draft state');
    console.log('PASS cross-organization inventory: picker, inspection, auto-link, save and reload');
  } finally {
    const source=expectStatus(await api(actor,'/api/v1/physical-sources'),200,'read own QA inventory for archival').body.items.find(s=>s.id===imported.sourceId);
    if(source)expectStatus(await api(actor,`/api/v1/structure-inventories/${source.id}/archive`,{method:'POST',etag:`"${source.revision}"`}),200,'archive only this test-created inventory');
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
    '[aria-label="Entitäten bearbeiten"] input': 'edge_employee',
    '.field-list input[formcontrolname="name"]': 'employee_id',
    '.field-list textarea[formcontrolname="shortDescription"]': 'Stabiler synthetischer Identifikator.',
  });
  await waitFor(
    "document.querySelector('.review-owner-info')?.textContent.includes('Christiano Stadello') && document.querySelector('.review-owner-info')?.textContent.includes('Sibilla Di Ciesa')",
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
  await openSourceCardMenu(createdSource.id);
  const imported = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(sourceName)}));
    const button = card?.querySelector('.source-actions-menu button');
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
  await openSourceCardMenu(createdSource.id);
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
  invariant(await evaluate(`document.querySelector('.field-panel-form input[formcontrolname="order"]')?.value === '1'`), 'first derived field must display order 1');
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

  const originalFieldName = await evaluate(`document.querySelector('.field-panel-form input[formcontrolname="name"]').value`);
  await setControls({
    '.field-panel-form input[formcontrolname="name"]': 'fahrzeug_grösse',
    '.field-panel-form textarea[formcontrolname="shortDescription"]': 'Fahrzeuggrösse für die Prüfung',
  });
  await waitFor("document.querySelector('.field-endpoint strong')?.textContent==='fahrzeug_grösse'",'field name did not update live in the graph');
  const beforeDraftSave=expectStatus(await api('christian.man',`/api/v1/logical-models/${modelId}`),200,'verify live name is not persisted').body;
  invariant(beforeDraftSave.entities[0].fields[0].name===originalFieldName,'typing a field name wrote to the server');
  await clickText('.mapping-toolbar nav button','Tabelle');
  await waitFor("document.querySelector('.mapping-matrix')?.textContent.includes('fahrzeug_grösse')",'matrix did not show the temporary name');
  await clickText('.mapping-toolbar nav button','Drift');
  await clickText('.mapping-toolbar nav button','Graph');
  await waitFor("document.querySelector('.field-panel-form input[formcontrolname=name]')?.value==='fahrzeug_grösse'",'view switching discarded the temporary name');
  await capturePageSegmentScreenshot('.mapping-shell','live-field-name-unsaved.png');
  await clickText('.toolbar-actions button','Entwurf speichern');
  await waitFor("document.querySelector('.mapping-side')?.innerText.includes('Alle Änderungen gespeichert')", 'Unicode field name did not save in the compact field panel');
  const savedField = expectStatus(await api('christian.man', `/api/v1/logical-models/${modelId}`), 200, 'read Unicode field save').body.entities[0].fields[0];
  invariant(savedField.name === 'fahrzeug_grösse' && savedField.position === 0, 'Unicode name or zero-based persisted position changed on field save');
  await navigate(`/models/${modelId}/mappings?physicalSnapshotId=${snapshotId}`, 'christian.man');
  await waitFor(`document.querySelector('.field-panel-form input[formcontrolname="name"]')?.value === 'fahrzeug_grösse'`, 'saved Unicode field did not survive reload');
  invariant(await evaluate(`document.querySelector('.field-panel-form input[formcontrolname="order"]')?.value === '1'`), 'field order shifted after save');
  await capturePageSegmentScreenshot('.mapping-shell', 'unicode-field-saved.png');
  await setControls({'.field-panel-form input[formcontrolname="name"]': originalFieldName});
  await clickText('.field-panel-form button[type="submit"]', 'Feldmerkmale speichern');
  await waitFor(`(async () => {const response=await fetch('/api/v1/logical-models/${modelId}',{headers:{'X-DaCa-User':'christian.man'}});return response.ok&&(await response.json()).entities[0].fields[0].name===${JSON.stringify(originalFieldName)};})()`, 'restoring the fixture field name did not save');
  await waitFor("(() => {const button=document.querySelector('.draft-save-action>button');return button?.disabled&&button.textContent.trim()==='Entwurf speichern';})()",'field save did not finish rebasing the workspace draft');
  await navigate(`/models/${modelId}/mappings?physicalSnapshotId=${snapshotId}`, 'christian.man');
  await waitFor(`document.querySelector('.field-panel-form input[formcontrolname="name"]')?.value === ${JSON.stringify(originalFieldName)}`, 'restored fixture field did not survive reload');
  console.log('PASS field-characteristics: live graph/matrix preview, no typing-time persistence, view switching, toolbar save, Unicode name and stable order');

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
  await waitForWorkspaceSave('second representation mappings were not persisted');
  mappings = expectStatus(
    await api('christian.man', `/api/v1/asset-mappings?logicalModelId=${modelId}`),
    200,
    'list mappings across both physical representations',
  ).body.items;
  invariant(new Set(mappings.map((mapping) => mapping.physicalSnapshotId)).size === 2, 'logical model is not linked to two physical representations');
  invariant(await evaluate("document.querySelectorAll('.representation-list .representation-select').length >= 2"), 'mapping workspace does not list both physical representations');
  await navigate(mappingPath, 'christian.man');
  await waitFor("document.querySelectorAll('.physical-representation').length >= 2", 'saved representations did not survive reload');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2},sessionId);
  await evaluate(`(() => {
    window.saveReasonScrollAt=Date.now();
    window.saveReasonScrollListener=()=>window.saveReasonScrollAt=Date.now();
    document.addEventListener('scroll',window.saveReasonScrollListener,true);
    document.querySelector('.draft-save-action').scrollIntoView({block:'center',behavior:'instant'});
  })()`);
  await waitFor('Date.now()-window.saveReasonScrollAt>400','save action did not stop scrolling');
  await evaluate("document.removeEventListener('scroll',window.saveReasonScrollListener,true)");
  const saveHover=await evaluate(`(() => {
    const trigger=document.querySelector('.draft-save-action');
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
  invariant(Object.keys(expectStatus(await api('christian.man',`/api/v1/logical-models/${modelId}/canvas-layout`),200,'read unsaved canvas').body.positions).length===0,'dragging a card persisted its position before Save draft');
  const sharedPositions=await evaluate(`(() => Object.fromEntries([document.querySelector('.logical-node'),...document.querySelectorAll('.physical-representation')].map(card=>[card.classList.contains('logical-node')?'logical':'physical:'+card.dataset.representationTableId,{x:card.offsetLeft,y:card.offsetTop}])))()`);
  await clickText('.toolbar-actions button','Entwurf speichern');
  await waitForWorkspaceSave('shared canvas positions did not save');
  const savedLayout=expectStatus(await api('christian.man',`/api/v1/logical-models/${modelId}/canvas-layout`),200,'read shared canvas').body;
  invariant(savedLayout.revision===1&&Object.entries(savedLayout.positions).every(([key,point])=>point.x===sharedPositions[key].x&&point.y===sharedPositions[key].y),'saved canvas positions differ from the draft');
  await evaluate(`document.querySelector('[data-representation-table-id="${beforeDrag.id}"] .physical-table-title').click()`);
  await clickText('.representation-context-menu button','Darstellung dieser Physischen Repräsentation/Deklaration löschen');
  await waitFor(`document.querySelector('[data-representation-table-id="${beforeDrag.id}"]')===null`,'remove drawing did not hide its card');
  invariant(await evaluate("document.querySelector('.draft-save-action>button').disabled"),'removing a drawing dirtied persisted mappings');
  invariant(await evaluate(`!document.querySelector('[data-representation-id="${beforeDrag.id}"]')`),'hidden representation remained in the physical bindings');
  await clickText('.representation-actions button','Ausgeblendete einblenden');
  await waitFor(`document.querySelector('[data-representation-table-id="${beforeDrag.id}"]')?.offsetLeft===${beforeDrag.left+300}`,'restoring a drawing lost its position');
  const afterDrawingActions=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${modelId}`),200,'read mappings after canvas actions').body.items;
  invariant(JSON.stringify(afterDrawingActions.map((item)=>item.versionId).sort())===JSON.stringify(mappings.map((item)=>item.versionId).sort()),'canvas actions modified mapping versions');
  await navigate(mappingPath,'christian.man');
  await waitFor(`document.querySelector('[data-representation-table-id="${beforeDrag.id}"]')?.offsetLeft===${beforeDrag.left+300}`,'shared canvas position did not survive reload');
  console.log('PASS shared canvas: local drag, explicit save, unchanged mapping versions, drawing visibility and position after reload');

  return { sourceId: createdSource.id, sourceName, snapshotId, modelId };
}

async function holdConnectionFlow(physical) {
  const route=`/models/${physical.modelId}/mappings?physicalSnapshotId=${physical.snapshotId}`;
  await navigate(route,'christian.man');
  await waitFor("document.querySelectorAll('.field-endpoint').length>=5&&document.querySelector('.column-endpoint')!==null",'hold connection fields did not load');
  await evaluate("document.querySelector('.mapping-shell').requestFullscreen=undefined;document.querySelector('.fullscreen-toggle').click()");
  await waitFor("document.querySelector('.mapping-shell.is-fullscreen')!==null",'hold connection fullscreen missing');
  const pairs=await evaluate(`(() => {
    const logical=[...document.querySelectorAll('.field-endpoint')],physical=[...document.querySelectorAll('.physical-representation')].find(card=>card.querySelector('.physical-table-title strong')?.textContent.includes('logistics.vehicle_inventory'));
    const id=(rows,name,key)=>rows.find(row=>row.querySelector('strong').textContent===name)?.dataset[key];
    const columns=[...physical.querySelectorAll('.column-endpoint')];
    return [{field:id(logical,'vehicle_type_code','logicalFieldId'),column:id(columns,'designation_de','physicalColumnId')},{field:id(logical,'designation_de','logicalFieldId'),column:id(columns,'vehicle_type_code','physicalColumnId')}];
  })()`);
  invariant(pairs.every(pair=>pair.field&&pair.column),'hold connection requires fixture string fields');
  const initialCount=await evaluate("document.querySelectorAll('.mapping-edge').length");
  async function drag(pair,reverse=false,screenshot=false) {
    const from=reverse?`[data-physical-column-id="${pair.column}"]`:`[data-logical-field-id="${pair.field}"]`;
    const to=reverse?`[data-logical-field-id="${pair.field}"]`:`[data-physical-column-id="${pair.column}"]`;
    // Shared positions may put the endpoints farther apart than one viewport.
    // Start on the visible source, then scroll to the target with the pointer held.
    await evaluate(`document.querySelector(${JSON.stringify(from)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`);
    await settleFrames();
    const points=await evaluate(`(() => {const a=document.querySelector(${JSON.stringify(from)}).getBoundingClientRect(),b=document.querySelector(${JSON.stringify(to)}).getBoundingClientRect();return {a:{x:a.left+a.width/2,y:a.top+a.height/2},b:{x:b.left+b.width/2,y:b.top+b.height/2}};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.a},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...points.a,button:'left',buttons:1,clickCount:1},sessionId);
    await waitFor("document.querySelectorAll('.connection-preview circle').length===2",'holding the field did not expose red drag points');
    await evaluate(`document.querySelector(${JSON.stringify(to)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`);
    points.b=await evaluate(`(() => {const rect=document.querySelector(${JSON.stringify(to)}).getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:(points.a.x+points.b.x)/2,y:(points.a.y+points.b.y)/2,buttons:1},sessionId);
    if(!await evaluate("document.querySelector('.connection-preview path')!==null")){
      await captureScreenshot('mapping-hold-preview-failure.png');
      throw new Error('Preview disappeared after pointer move: '+JSON.stringify(await evaluate("({notice:document.querySelector('p.visually-hidden[aria-live]')?.textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(item=>item.textContent?.slice(0,300))})")));
    }
    if(screenshot){
      invariant(await evaluate("getComputedStyle(document.querySelector('.connection-preview path')).stroke===getComputedStyle(document.querySelector('.connection-preview circle')).fill"),'preview line and dot colors differ');
      await captureScreenshot('mapping-red-connection-preview.png');
    }
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.b,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...points.b,button:'left',buttons:0,clickCount:1},sessionId);
    await waitFor("document.querySelector('.connection-preview')===null",'drag preview survived release');
  }
  await drag(pairs[0],false,true);
  await waitFor(`document.querySelectorAll('.mapping-edge').length===${initialCount+1}`,'logical-to-physical drop did not create exactly one draft');
  invariant(await evaluate("!document.querySelector('.mapping-dialog')?.open"),'drag unexpectedly opened a second mapping dialog');
  await drag(pairs[1],true);
  await waitFor(`document.querySelectorAll('.mapping-edge').length===${initialCount+2}`,'physical-to-logical drop did not create exactly one draft');
  await drag(pairs[0]);
  invariant(await evaluate(`document.querySelectorAll('.mapping-edge').length===${initialCount+2}`),'duplicate drag added another mapping');
  await captureScreenshot('mapping-blue-connected-endpoints.png');
  await clickText('.toolbar-actions button','Entwurf speichern');
  await waitForWorkspaceSave('held connections did not save');
  await navigate(route,'christian.man');
  for(const pair of pairs)await waitFor(`document.querySelector('.edge-line[data-edge-logical-field-id="${pair.field}"][data-edge-physical-column-id="${pair.column}"]')!==null`,'held connection did not survive reload');
  console.log('PASS hold-to-connect: both directions, red preview, duplicate rejection, draft save and reload');
}

async function fieldMoveFlow() {
  await navigate('/models','christian.man');
  const reference=expectStatus(await api('christian.man','/api/v1/logical-models/be6eb7a4-6bf3-5387-8aaa-86c01a46290b'),200,'read field move reference').body;
  const suffix=Date.now(),targetTitle=`Field move target ${suffix}`;
  const write=(target)=>({identifiers:[`EDGE-MOVE-${target?'TARGET':'SOURCE'}-${suffix}`],localizations:[{language:'de',title:target?targetTitle:`Field move source ${suffix}`,description:'Isolated field move browser test.'}],
    dataOwnerUserId:reference.dataOwnerUserId,deputyOwnerUserId:reference.deputyOwnerUserId,creator:{type:'Application',applicationName:'Field move QA'},dataDomainId:null,
    organizationUnitId:reference.organizationId,dataClassification:'internal',dateCreated:new Date().toISOString().slice(0,10),contactPoints:[{name:'Field move QA',email:'move@example.test'}],publisher:reference.publisher,
    accessRights:'urn:daca:access-rights:internal',entities:[{name:target?'move_target':'move_source',businessObject:'Fahrzeug',fields:(target?['existing_target_field']:['field_to_move','field_to_keep']).map((name,position)=>({name,position,dataType:'string',shortDescription:'Synthetic field.',classification:'internal'}))}]});
  const source=expectStatus(await api('christian.man','/api/v1/logical-models',{method:'POST',body:write(false)}),201,'create isolated field move source').body;
  const target=expectStatus(await api('christian.man','/api/v1/logical-models',{method:'POST',body:write(true)}),201,'create isolated field move target').body;
  await navigate(`/models/${source.id}/mappings`,'christian.man');
  await waitFor("document.querySelector('.mapping-side .entity-search:not(:disabled)')!==null",'entity search action missing');
  invariant(await evaluate("document.querySelector('.mapping-side input[formcontrolname=entityName]').readOnly"),'entity remains editable from field characteristics');
  async function reviewMove(){
    await evaluate("document.querySelector('.mapping-side .entity-search').click()");
    await waitFor("document.querySelector('.field-move-dialog[open] .model-results button')!==null",'model search did not open');
    await setControls({'.field-move-dialog input[type=search]':targetTitle});
    await waitFor("document.querySelectorAll('.field-move-dialog .model-results button').length===1",'model search did not filter its results');
    await evaluate("document.querySelector('.field-move-dialog .model-results button').click()");
    await waitFor("document.querySelector('.field-move-dialog select')?.options.length===1",'destination entities did not load');
    await clickText('.field-move-dialog button','Verschiebung prüfen');
    await waitFor("document.querySelector('.field-move-dialog .move-warning')!==null",'strict move warning missing');
    invariant(await evaluate("[...document.querySelectorAll('.field-move-dialog footer button')].find(button=>button.textContent==='Feld jetzt verschieben').disabled"),'move is possible without explicit confirmation');
  }
  await reviewMove();await capturePageSegmentScreenshot('.field-move-dialog','field-move-warning.png');
  await clickText('.field-move-dialog button','Abbrechen');
  invariant(expectStatus(await api('christian.man',`/api/v1/logical-models/${source.id}`),200,'check cancelled field move').body.versionId===source.versionId,'cancel changed source model');
  await reviewMove();
  await evaluate("const check=document.querySelector('.field-move-dialog input[type=checkbox]');check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}))");
  await setControls({'.field-move-dialog input[autocomplete=off]':'field_to_move'});
  await clickText('.field-move-dialog button','Feld jetzt verschieben');
  await waitFor("document.querySelector('.field-move-dialog')===null&&document.querySelectorAll('.field-endpoint').length===1",'field did not disappear after move');
  const updated=expectStatus(await api('christian.man',`/api/v1/logical-models/${target.id}`),200,'read move destination').body;
  invariant(updated.revision===target.revision+1&&updated.entities[0].fields.some(field=>field.name==='field_to_move'),'field not stored in destination');
  await navigate(`/models/${target.id}/mappings`,'christian.man');
  await waitFor("[...document.querySelectorAll('.field-endpoint strong')].some(field=>field.textContent==='field_to_move')",'moved field not visible after destination reload');
  await capturePageSegmentScreenshot('.mapping-shell','field-move-destination.png');
  console.log('PASS field move: read-only entity, search, strict confirmation, cancellation, atomic move and destination reload');
}

async function edgeEditingFlow(physical) {
  const route=`/models/${physical.modelId}/mappings?physicalSnapshotId=${physical.snapshotId}`;
  await navigate(route,'christian.man');
  await waitFor("document.querySelector('.mapping-edge .edge-hit')!==null",'interactive mapping lines did not render');
  const before=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${physical.modelId}`),200,'read line-edit mappings').body.items;
  const mapping=before.find((item)=>item.status!=='superseded'&&item.physicalSnapshotId===physical.snapshotId&&item.logicalFieldVersionIds.length===1&&item.physicalColumnIds.length===1);
  invariant(mapping,'line-edit test requires a single-field PG mapping');
  const mappingId=mapping.id,fieldId=mapping.logicalFieldVersionIds[0],columnId=mapping.physicalColumnIds[0];
  const nextColumn=await evaluate(`(() => {const original=document.querySelector('[data-physical-column-id="${columnId}"]');return [...original.closest('.physical-representation').querySelectorAll('.column-endpoint')].find((item)=>item.dataset.physicalColumnId!=='${columnId}').dataset.physicalColumnId;})()`);
  const nextField=before.find((item)=>item.status!=='superseded'&&item.id!==mappingId&&item.physicalSnapshotId===physical.snapshotId&&item.logicalFieldVersionIds.length===1&&!item.physicalColumnIds.includes(nextColumn)).logicalFieldVersionIds[0];
  // Exercise the viewport-filling fallback here; native Escape always exits browser fullscreen.
  await evaluate("document.querySelector('.mapping-shell').requestFullscreen=undefined;document.querySelector('.fullscreen-toggle').click()");
  await waitFor("document.querySelector('.mapping-shell.is-fullscreen')?.getBoundingClientRect().height>=innerHeight-1",'line editor viewport did not open');
  await settleFrames();
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
    await settleFrames();
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
    await settleFrames();
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
  await waitForWorkspaceSave('line edits did not save');
  const saved=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${physical.modelId}`),200,'read saved line edits').body.items.find((item)=>item.id===mappingId);
  invariant(saved.status==='draft'&&saved.mappingType==='Derived'&&saved.transformationRule==='concat(source_a, source_b)'&&saved.physicalSnapshotId===mapping.physicalSnapshotId&&saved.logicalFieldVersionIds[0]===nextField&&saved.physicalColumnIds[0]===nextColumn&&saved.versionId!==mapping.versionId,'saved line changes lost endpoint, snapshot, type or successor identity');
  await navigate(route,'christian.man');
  await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-line')?.dataset.edgePhysicalColumnId==='${nextColumn}'`,'line edits did not survive reload');
  invariant(await evaluate(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-hit title')?.textContent.includes('aus einem oder mehreren Feldern')`),'assigned line type lacks its tooltip explanation');
  await evaluate(`document.querySelector('[data-edge-mapping-id="${mappingId}"] .edge-hit').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  await waitFor("document.querySelector('.mapping-detail h2 .daca-glossary-trigger')?.textContent==='Derived'",'assigned inspector type did not render');
  async function hoverAssignedType(selector) {
    await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent==='Derived').scrollIntoView({block:'center',behavior:'instant'})`);
    await settleFrames();
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5},sessionId);
    const point=await evaluate(`(() => {const trigger=[...document.querySelectorAll(${JSON.stringify(selector)})].find((item)=>item.textContent==='Derived');const r=trigger.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
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
  await evaluate("window.__originalConfirm=window.confirm;window.__lineDeletePrompts=0;window.confirm=()=>{window.__lineDeletePrompts++;return false}");
  await clickText('.edge-context-menu button','Beziehung löschen');
  await waitFor(`document.querySelector('[data-edge-mapping-id="${mappingId}"]')===null`,'deleting relationship did not remove its edge');
  invariant(await evaluate('window.__lineDeletePrompts===0'),'removing a line requested confirmation');
  await evaluate('window.confirm=window.__originalConfirm;delete window.__originalConfirm');
  invariant(await evaluate('document.querySelectorAll(".physical-representation").length')===representationCount,'relationship deletion removed a physical representation');
  const staged=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${physical.modelId}`),200,'read relationship before saving removal').body.items.find((item)=>item.id===mappingId);
  invariant(staged.status===saved.status&&staged.versionId===saved.versionId,'line deletion was persisted before pressing Save draft');
  await capturePageSegmentScreenshot('.mapping-shell','mapping-line-removal-unsaved.png');
  await clickText('.toolbar-actions button','Entwurf speichern');
  await waitForWorkspaceSave('pending line removal did not save');
  const deleted=expectStatus(await api('christian.man',`/api/v1/asset-mappings?logicalModelId=${physical.modelId}`),200,'read deleted relationship history').body.items.find((item)=>item.id===mappingId);
  invariant(deleted.status==='superseded','line deletion did not preserve superseded history');
  await navigate(route,'christian.man');
  await waitFor("document.querySelector('.graph-canvas')!==null",'workspace did not reload after removal');
  invariant(await evaluate(`document.querySelector('[data-edge-mapping-id="${mappingId}"]')===null`),'removed line returned after saving and reloading');
  console.log(`PASS line-editing: no delete prompt, local-only removal until Save draft, immutable history and reload: ${mappingId}`);
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
  try {
    await waitFor("document.querySelectorAll('.physical-representation').length===2&&document.querySelector('.logical-node .model-domain')?.textContent.includes('Keine Domäne')",'unassigned domain headers did not render');
  } catch (error) {
    const context=await evaluate("({cards:document.querySelectorAll('.physical-representation').length,domain:document.querySelector('.logical-node .model-domain')?.textContent,errors:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})");
    await captureScreenshot('domain-assignment-failure.png');
    throw new Error(`${error.message}: ${JSON.stringify(context)}`);
  }
  const pgId=await evaluate("[...document.querySelectorAll('.physical-representation')].find((card)=>!card.textContent.includes('.parquet')).dataset.representationTableId");
  await evaluate("document.querySelector('.field-endpoint').click();[...document.querySelectorAll('.physical-representation')].find((card)=>card.textContent.includes('.parquet')).querySelector('.column-endpoint').click()");
  await waitFor("document.querySelector('.mapping-dialog[open]')!==null",'local mapping editor did not open for domain rebase test');
  await clickText('.mapping-dialog button','Mapping übernehmen');
  await waitFor("document.querySelector('.draft-save-action>button').disabled===false",'local mapping draft did not survive initial creation');
  const openLogical=async()=>{await evaluate("document.querySelector('.logical-node>header').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:250,clientY:200}))");await waitFor("[...document.querySelectorAll('.canvas-context-menu button')].some((button)=>button.textContent==='Domäne zuordnen')",'logical domain context action missing');};
  await openLogical();
  const hover=await evaluate("(() => {const row=[...document.querySelectorAll('.canvas-context-menu button')].find((button)=>button.textContent==='Domäne zuordnen'),r=row.getBoundingClientRect();return{x:r.left+15,y:r.top+r.height/2,background:getComputedStyle(row).backgroundColor};})()");
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:hover.x,y:hover.y},sessionId);
  await waitFor(`(() => {const row=[...document.querySelectorAll('.canvas-context-menu button')].find((button)=>button.textContent==='Domäne zuordnen'),style=getComputedStyle(row);return row.matches(':hover')&&style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.fontSize==='14px'&&parseFloat(style.paddingTop)===7&&style.boxShadow==='none';})()`,'menu hover does not highlight the entire row');
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
  await waitForWorkspaceSave('mapping draft was not rebased after logical domain assignment');
  await navigate(route,'christian.man');
  await waitFor("document.querySelectorAll('.physical-representation .model-domain').length===2&&[...document.querySelectorAll('.model-domain')].every((label)=>!label.textContent.includes('Keine Domäne'))",'domain labels did not survive reload');
  await evaluate(`document.querySelector('[data-representation-table-id="${pgId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:250}))`);
  invariant(await evaluate(`document.querySelector('.representation-context-menu a[href^=\"/domains/\"]')?.getAttribute('href')==='/domains/${domainId}'&&!document.querySelector('.representation-context-menu a[href^=\"/domains/\"]')?.target`),'assigned physical domain cannot be opened');
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

async function approveTestDomainRequest(request, reviewer='christian.man') {
  const approved=expectStatus(await api(reviewer,`/api/v1/domain-change-requests/${request.id}/decision`,{method:'POST',etag:`"${request.revision}"`,body:{decision:'approve',comment:'Synthetic UI test: scoped ALDS approval.'}}),200,'approve only synthetic domain request').body;
  return expectStatus(await api(reviewer,`/api/v1/domains/${approved.targetDomainId}`),200,'read approved synthetic domain').body;
}

async function createApprovedTestDomain(actor,payload) {
  // Sibilla's home is GS-VBS. Exercise the evidenced VBS handover instead of
  // pretending that Verteidigung's ALDS can approve a new GS-VBS domain.
  const handedOver = payload.ownerUserId === 'sibilla.micheli';
  const creationPayload = handedOver ? {...payload,ownerUserId:'lawrence.hill',deputyOwnerUserId:'hong.an.captain'} : payload;
  const request=expectStatus(await api(actor,'/api/v1/domain-change-requests',{method:'POST',body:{operation:'create',payload:creationPayload}}),201,'submit only synthetic domain').body;
  const domain=await approveTestDomainRequest(request);
  if(!handedOver)return domain;
  return expectStatus(await api('sibilla.micheli',`/api/v1/domains/${domain.id}/transfer`,{method:'POST',etag:`"${domain.revision}"`,body:{ownerUserId:payload.ownerUserId,deputyOwnerUserId:payload.deputyOwnerUserId,reason:'Synthetic VBS domain handed over to the GS-VBS LDSD.'}}),200,'transfer synthetic domain within VBS').body;
}

async function semanticGestureFlow() {
  await navigate('/domains?view=cards','christian.man');
  const suffix=Date.now(),domains=[],globalPath='/api/v1/semantic-graphs/domains';
  const viewPath='/api/v1/domain-network/view',personalBaseline=expectStatus(await api('sibilla.micheli',viewPath),200,'read gesture personal view baseline').body;
  const baseline=expectStatus(await api('sibilla.micheli',globalPath),200,'read gesture graph baseline').body;let lastWritten=null;
  const approve=async proposal=>{let result=proposal;for(const review of proposal.reviews)result=expectStatus(await api(review.ownerUserId,`/api/v1/glossary/term-proposals/${proposal.id}/reviews/${review.domainId}/decision`,{method:'POST',etag:`"${proposal.revision}"`,body:{decision:'approve',comment:'Synthetische Gestenprüfung.'}}),200,'approve only synthetic gesture term').body;return result;};
  const createTerm=async(domainId,label)=>{const proposal=expectStatus(await api('christian.man','/api/v1/glossary/term-proposals',{method:'POST',body:{operation:'create',payload:{domainIds:[domainId],localizations:[{language:'de',preferredLabel:label,definition:'Synthetic gesture term.'}],relations:[]}}}),201,'create only synthetic gesture term').body;return(await approve(proposal)).targetTermId;};
  async function holdToBlank(selector,root='.network-editor') {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
    await settleFrames();
    const points=await evaluate(`(() => {const box=document.querySelector(${JSON.stringify(selector)}),card=box.closest('.graph-node'),r=box.getBoundingClientRect(),view=document.querySelector(${JSON.stringify(root+' .semantic-graph')}).getBoundingClientRect();const candidates=[];for(const x of [.7,.85,.5])for(const y of [.6,.8,.4]){const point={x:view.left+view.width*x,y:view.top+Math.min(view.height,innerHeight-view.top-20)*y};const hit=document.elementFromPoint(point.x,point.y);if(hit?.closest('.graph-canvas')&&!hit.closest('.graph-node,.graph-relationship'))candidates.push(point);}if(!candidates.length)throw new Error('No visible blank canvas point');return{from:{x:r.left+r.width/2,y:r.top+r.height/2},to:candidates[0],style:card.style.cssText};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1},sessionId);
    await waitFor(`document.querySelectorAll(${JSON.stringify(root+' .hold-dot')}).length===2`,'holding the card did not expose the red point');
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.from.x+(points.to.x-points.from.x)*step/4,y:points.from.y+(points.to.y-points.from.y)*step/4,buttons:1},sessionId);
    invariant(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('.graph-node').style.cssText===${JSON.stringify(points.style)}`),'holding a card moved it instead of starting a connection');
    invariant(await evaluate(`(() => {const line=document.querySelector(${JSON.stringify(root+' .hold-line')}),dot=document.querySelector(${JSON.stringify(root+' .hold-dot')});return line&&dot&&getComputedStyle(line).stroke===getComputedStyle(dot).fill&&getComputedStyle(line).strokeDasharray==='none';})()`),'held connection must show a solid red line matching the red point');
    await captureScreenshot(root.includes('domain-network')?'domain-hold-red-preview.png':'term-hold-red-preview.png');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1},sessionId);
    await waitFor(`document.querySelector(${JSON.stringify(root+' .canvas-drop-menu')})!==null`,'blank drop did not open create/search actions');
  }
  try {
    for(const label of ['A','B'])domains.push(await createApprovedTestDomain('sibilla.micheli',{ownerUserId:'sibilla.micheli',deputyOwnerUserId:'sandro.wenger',localizations:[{language:'de',preferredLabel:`Gesture ${label} ${suffix}`,definition:'Synthetic gesture domain.'}]}));
    const catalogDomains=expectStatus(await api('sibilla.micheli','/api/v1/domains'),200,'read gesture visibility scope').body;
    expectStatus(await api('sibilla.micheli',viewPath,{method:'PUT',body:{revision:personalBaseline.revision,configuration:{schemaVersion:1,positions:{},addedDomainIds:[],hiddenDomainIds:catalogDomains.filter(domain=>!domains.some(owned=>owned.id===domain.id)).map(domain=>domain.id),visibleKinds:[]}}}),200,'isolate only gesture cards in the private view');
    const [domainA,domainB]=domains,a=await createTerm(domainA.id,`Ausgang ${suffix}`),b=await createTerm(domainB.id,`Referenz ${suffix}`),route=`/domains/${domainA.id}`;
    await navigate(route,'christian.man');await waitFor("document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'gesture term graph did not load');
    await evaluate("document.querySelector('.network-editor').requestFullscreen=undefined;document.querySelector('.network-editor .fullscreen-toggle').click()");
    await holdToBlank(`[data-term-id="${a}"] p`);
    await clickText('.canvas-drop-menu button','Begriff suchen');await waitFor("document.querySelector('.object-browser-backdrop input')!==null",'term selection modal missing');
    await setControls({'.object-browser-backdrop input':`Referenz ${suffix}`});await waitFor(`[...document.querySelectorAll('.object-browser-backdrop .object-result')].some(button=>button.textContent.includes('Referenz ${suffix}'))`,'reference search result missing');await clickText('.object-browser-backdrop .object-result',`Referenz ${suffix}`);
    await waitFor(`document.querySelector('.relation-dialog')?.getAttribute('data-target-id')==='${b}'`,'term search did not select a connection target');
    await clickText('.relation-dialog button','Entwurf übernehmen');
    await clickText('.layout-actions button','Layout speichern');await waitFor("document.querySelector('.layout-actions button')?.disabled&&document.querySelector('.layout-actions button')?.textContent.trim()==='Layout speichern'&&document.querySelector('.network-editor [role=status]')?.textContent.includes('Layout für alle gespeichert')",'reference layout did not save');
    const termGraphPath=`/api/v1/semantic-graphs/concepts/${domainA.id}`,layout=expectStatus(await api('christian.man',termGraphPath),200,'read reference membership').body;
    invariant(layout.additionalNodeIds.includes(`term:${b}`),'selected reference did not persist');
    invariant(!expectStatus(await api('christian.man',`/api/v1/glossary/terms/${b}`),200,'read selected term domains').body.domainIds.includes(domainA.id),'canvas selection reassigned the term to another domain');
    await clickText('.draft-actions button','Änderungen einreichen');await waitFor("document.querySelector('.pending-proposals a')!==null",'reference relation was not submitted');
    let proposals=expectStatus(await api('christian.man','/api/v1/glossary/term-proposals'),200,'read gesture proposals').body;await approve(proposals.find(proposal=>proposal.targetTermId===a&&proposal.status==='in_review'));
    await navigate(route,'christian.man');await waitFor("document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'shared reference graph reload missing');
    await evaluate("window.__gestureConfirms=0;window.confirm=()=>{window.__gestureConfirms++;return true;}");
    await evaluate(`document.querySelector('[data-source-id="term:${a}"][data-target-id="term:${b}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);
    await clickText('.edge-actions-menu button','Verbindungstyp ändern');await waitFor("document.querySelector('.relation-dialog')!==null",'edge type dialog missing');
    await evaluate("(() => {const type=document.querySelectorAll('.relation-dialog select')[1];type.value='broader';type.dispatchEvent(new Event('change',{bubbles:true}));})()");await clickText('.relation-dialog button','Entwurf übernehmen');
    await evaluate(`document.querySelector('[data-source-id="term:${a}"][data-target-id="term:${b}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);
    await clickText('.edge-actions-menu button','Verbindung löschen');invariant(await evaluate('window.__gestureConfirms===0'),'line deletion prompted for confirmation');
    invariant(expectStatus(await api('christian.man',`/api/v1/glossary/terms/${a}`),200,'read unsubmitted line deletion').body.relations.length===1,'line deletion persisted immediately');
    await clickText('.draft-actions button','Entwurf verwerfen');
    await evaluate(`document.querySelector('[data-term-id="${b}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);await clickText('.concept-context-menu button','Vom Canvas entfernen');
    await clickText('.layout-actions button','Layout speichern');await waitFor(`!document.querySelector('[data-term-id="${b}"]')&&document.querySelector('.layout-actions button')?.disabled&&document.querySelector('.layout-actions button')?.textContent.trim()==='Layout speichern'`,'hidden term layout did not save');
    invariant(expectStatus(await api('christian.man',`/api/v1/glossary/terms/${b}`),200,'read hidden term').body.lifecycle==='active','canvas removal retired the term');
    await clickText('.hidden-nodes button',`Referenz ${suffix}`);await clickText('.layout-actions button','Layout speichern');await waitFor("document.querySelector('.layout-actions button')?.disabled&&document.querySelector('.layout-actions button')?.textContent.trim()==='Layout speichern'",'restored term did not save');
    await evaluate("document.querySelector('.network-editor').requestFullscreen=undefined;document.querySelector('.network-editor .fullscreen-toggle').click()");
    await holdToBlank(`[data-term-id="${a}"] p`);await clickText('.canvas-drop-menu button','Neuen Begriff erstellen');
    await waitFor("document.querySelector('.create-backdrop input[formcontrolname=labelDe]')!==null",'term creation modal missing');
    await setControls({'.create-backdrop input[formcontrolname=labelDe]':`Neu ${suffix}`,'.create-backdrop textarea[formcontrolname=definitionDe]':'Synthetic created term.'});await clickText('.create-backdrop button','Term vorschlagen');
    await waitFor("document.querySelector('.graph-node.is-pending')!==null",'new term did not show a pending proposal card');await captureScreenshot('term-create-pending-card.png');
    proposals=expectStatus(await api('christian.man','/api/v1/glossary/term-proposals'),200,'read newly created term request').body;const newProposal=proposals.find(proposal=>proposal.operation==='create'&&proposal.status==='in_review'&&proposal.reviewPayload.localizations.some(label=>label.preferredLabel===`Neu ${suffix}`));invariant(newProposal,'term creation bypassed the proposal workflow');const newTerm=(await approve(newProposal)).targetTermId;
    await navigate(route,'sibilla.micheli');await waitFor(`document.querySelector('[data-term-id="${newTerm}"]')!==null&&document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'`,'approved term missing');
    await evaluate('window.confirm=()=>false');await evaluate(`document.querySelector('[data-term-id="${newTerm}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);await clickText('.concept-context-menu button','Im Katalog löschen');invariant(expectStatus(await api('sibilla.micheli',`/api/v1/glossary/terms/${newTerm}`),200,'read canceled term deletion').body.lifecycle==='active','canceled deletion changed the term');
    await evaluate('window.confirm=()=>true');await evaluate(`document.querySelector('[data-term-id="${newTerm}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);await clickText('.concept-context-menu button','Im Katalog löschen');await waitFor(`!document.querySelector('[data-term-id="${newTerm}"]')`,'confirmed term deletion left an active card');
    invariant(expectStatus(await api('sibilla.micheli',`/api/v1/glossary/terms/${newTerm}`),200,'read retired term history').body.lifecycle==='retired','term deletion did not preserve retirement history');
    await navigate('/domains/network?ownOffice=0','sibilla.micheli');await waitFor(`document.querySelector('[data-domain-id="${domainA.id}"]')!==null`,'domain gesture canvas missing');await evaluate("document.querySelector('.domain-network .canvas-tools button:last-child').click()");
    // A held drop onto a domain draws the default relation immediately, without persisting it.
    const initialDomainEdgeCount=await evaluate("document.querySelectorAll('.domain-network [data-domain-link]').length");
    await evaluate(`document.querySelector('[data-domain-id="${domainA.id}"] p').scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
    await settleFrames();
    const heldPoints=await evaluate(`(() => {const source=document.querySelector('[data-domain-id="${domainA.id}"] p'),target=document.querySelector('[data-domain-id="${domainB.id}"] p');const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();return{from:{x:a.left+a.width/2,y:a.top+4},to:{x:b.left+b.width/2,y:b.top+4}};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...heldPoints.from},sessionId);
    await waitFor("document.querySelector('.daca-glossary-tooltip[role=tooltip]')!==null",'domain description did not use the catalog tooltip');
    invariant(await evaluate(`(() => {const text=document.querySelector('[data-domain-id="${domainA.id}"] p');return !text.hasAttribute('title')&&getComputedStyle(text).cursor==='grab'&&getComputedStyle(document.querySelector('[role=tooltip]')).zIndex==='2400';})()`),'description cursor or rich tooltip layering is incorrect');
    await captureScreenshot('domain-description-tooltip.png');
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...heldPoints.from,button:'left',buttons:1,clickCount:1},sessionId);
    await waitFor("document.querySelector('.domain-network .hold-line')!==null",'domain hold did not activate');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...heldPoints.to,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...heldPoints.to,button:'left',buttons:0,clickCount:1},sessionId);
    await waitFor(`document.querySelectorAll('.domain-network [data-domain-link]').length===${initialDomainEdgeCount+1}&&!document.querySelector('.domain-network .relation-dialog')`,'domain drop did not draw an immediate draft link');
    invariant(expectStatus(await api('sibilla.micheli',globalPath),200,'read unsaved held domain connection').body.relations.every(link=>link.sourceId!==domainA.id),'held connection saved automatically');
    await evaluate("[...document.querySelectorAll('.domain-network [data-domain-link]')].at(-1).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))");
    invariant(await evaluate("getComputedStyle(document.querySelector('.concept-context-menu [role=menuitem]')).fontSize==='14px'"),'domain context menu is not using the shared compact font');
    await clickText('.concept-context-menu button','Verbindung l\u00f6schen');
    await holdToBlank(`[data-domain-id="${domainA.id}"] p`,'.domain-network');await clickText('.canvas-drop-menu button','Domäne suchen');await waitFor("document.querySelector('.object-browser-backdrop input')!==null",'domain selection modal missing');
    await setControls({'.object-browser-backdrop input':domainB.preferredLabel});await waitFor(`[...document.querySelectorAll('.object-browser-backdrop .object-result')].some(button=>button.textContent.includes(${JSON.stringify(domainB.preferredLabel)}))`,'domain target search result missing');await clickText('.object-browser-backdrop .object-result',domainB.preferredLabel);await waitFor("document.querySelector('.relation-dialog')!==null",'domain search did not prepare a relation');await clickText('.relation-dialog button','Entwurf übernehmen');await clickText('.draft-actions button','Netz speichern');await waitFor("document.querySelector('.domain-network .draft-actions button')?.disabled&&document.querySelector('.domain-network .draft-actions button')?.textContent.trim()==='Netz speichern'",'domain selection relation did not save');lastWritten=expectStatus(await api('sibilla.micheli',globalPath),200,'read selected domain relation').body;
    await holdToBlank(`[data-domain-id="${domainA.id}"] p`,'.domain-network');await clickText('.canvas-drop-menu button','Neue Domäne erstellen');await waitFor("document.querySelector('.create-backdrop input[name=label]')!==null",'domain creation modal missing');
    await setControls({'.create-backdrop input[name=label]':`Erstellt ${suffix}`,'.create-backdrop textarea[name=definition]':'Synthetic created domain.','.create-backdrop select[name=owner]':'lawrence.hill','.create-backdrop select[name=deputy]':'hong.an.captain'});await clickText('.create-backdrop button','ALDS-Freigabe');
    await waitFor("document.querySelector('.domain-network .is-pending')",'new domain did not remain a personal proposal');
    const pending=expectStatus(await api('sibilla.micheli','/api/v1/domain-change-requests'),200,'read synthetic domain request').body.find(item=>item.status==='submitted'&&item.reviewPayload.localizations.some(label=>label.preferredLabel===`Erstellt ${suffix}`));
    invariant(pending,'domain modal did not submit its proposal');
    const approvedDomain=await approveTestDomainRequest(pending);
    const createdDomain=expectStatus(await api('sibilla.micheli',`/api/v1/domains/${approvedDomain.id}/transfer`,{method:'POST',etag:`"${approvedDomain.revision}"`,body:{ownerUserId:'sibilla.micheli',deputyOwnerUserId:'sandro.wenger',reason:'Synthetic domain handed over to the VBS LDSD.'}}),200,'handover synthetic canvas domain').body;domains.push(createdDomain);
    await navigate('/domains/network?ownOffice=0','sibilla.micheli');
    await waitFor(`document.querySelector('[data-domain-id="${createdDomain.id}"]')`,'approved domain did not enter the canvas');
    await evaluate(`document.querySelector('[data-domain-id="${domainA.id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);
    await clickText('.concept-context-menu button','Neue Domänenbeziehung');
    await evaluate(`document.querySelector('[data-domain-id="${createdDomain.id}"]').click()`);
    await waitFor("document.querySelector('.relation-dialog')",'approved domain did not offer an explicit relation');
    await clickText('.relation-dialog button','Entwurf übernehmen');await clickText('.draft-actions button','Netz speichern');
    await waitFor("document.querySelector('.domain-network .draft-actions button')?.disabled&&document.querySelector('.domain-network .draft-actions button')?.textContent.trim()==='Netz speichern'",'approved domain layout did not save');
    lastWritten=expectStatus(await api('sibilla.micheli',globalPath),200,'read created domain graph').body;await captureScreenshot('domain-created-from-canvas.png');
    await evaluate(`document.querySelector('[data-domain-id="${domainB.id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);await clickText('.concept-context-menu button','Darstellung dieser Domäne entfernen');await clickText('.draft-actions button','Netz speichern');await waitFor("document.querySelector('.domain-network .draft-actions button')?.disabled&&document.querySelector('.domain-network .draft-actions button')?.textContent.trim()==='Netz speichern'",'domain hide did not save');
    invariant(expectStatus(await api('sibilla.micheli',`/api/v1/domains/${domainB.id}`),200,'read hidden domain').body.lifecycle==='active','hiding a domain retired it');
    await clickText('.hidden-nodes button',domainB.preferredLabel);await clickText('.draft-actions button','Netz speichern');await waitFor("document.querySelector('.domain-network .draft-actions button')?.disabled&&document.querySelector('.domain-network .draft-actions button')?.textContent.trim()==='Netz speichern'",'restored domain did not save');lastWritten=expectStatus(await api('sibilla.micheli',globalPath),200,'read restored domain layout').body;
    await navigate(route,'sibilla.micheli');await waitFor("document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'neighbor canvas did not load');
    invariant(await evaluate("document.querySelectorAll('.graph-node.is-domain').length===1"),'neighbor domains were enabled by default');
    await clickText('.canvas-options-toggle','\u22ef');await waitFor("document.querySelector('.canvas-options [role=menuitemcheckbox]')!==null",'canvas display menu missing');
    await clickText('.canvas-options button','Direkt verbundene');
    await waitFor(`document.querySelector('[data-node-id="domain:${domainB.id}"]')!==null&&document.querySelector('[data-node-id="domain:${createdDomain.id}"]')!==null`,'direct domain neighbors did not appear');
    invariant(await evaluate(`(() => {const neighbors=[...document.querySelectorAll('.graph-node.is-domain')].filter(node=>node.dataset.nodeId!=='domain:${domainA.id}'),cards=[...document.querySelectorAll('.graph-node')];return neighbors.every(node=>cards.every(other=>{if(node===other)return true;const a=node.getBoundingClientRect(),b=other.getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;}));})()`),'new neighboring domain cards overlap existing cards');
    await capturePageSegmentScreenshot('.network-editor','concept-linked-domains.png');
    await clickText('.canvas-options button','Direkt verbundene');await waitFor("document.querySelectorAll('.graph-node.is-domain').length===1",'neighbor domains did not hide');
    await navigate('/domains/network?ownOffice=0','sibilla.micheli');await waitFor(`document.querySelector('[data-domain-id="${createdDomain.id}"]')!==null`,'domain canvas did not reload');
    await evaluate('window.confirm=()=>false');await evaluate(`document.querySelector('[data-domain-id="${createdDomain.id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);await clickText('.concept-context-menu button','Domäne im Katalog stilllegen');invariant(expectStatus(await api('sibilla.micheli',`/api/v1/domains/${createdDomain.id}`),200,'read canceled domain deletion').body.lifecycle==='active','canceled domain deletion changed the catalog');
    await evaluate('window.confirm=()=>true');await evaluate(`document.querySelector('[data-domain-id="${createdDomain.id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);await clickText('.concept-context-menu button','Domäne im Katalog stilllegen');await waitFor(`!document.querySelector('[data-domain-id="${createdDomain.id}"]')`,'confirmed domain deletion left an active card');
    console.log('PASS canvas gestures: held red point, create/search modals, reference membership, hide/restore, line actions and confirmed catalog deletion');
  } finally {
    const personalCurrent=expectStatus(await api('sibilla.micheli',viewPath),200,'read gesture personal view cleanup').body;
    expectStatus(await api('sibilla.micheli',viewPath,{method:'PUT',body:{revision:personalCurrent.revision,configuration:personalBaseline.configuration}}),200,'restore gesture personal view');
    if(lastWritten){const current=expectStatus(await api('sibilla.micheli',globalPath),200,'read gesture graph cleanup').body,positions={...current.positions},owned=new Set(domains.map(domain=>domain.id));for(const [key,value]of Object.entries(lastWritten.positions))if(JSON.stringify(current.positions[key])===JSON.stringify(value)){if(key in baseline.positions)positions[key]=baseline.positions[key];else delete positions[key];}for(const id of owned)delete positions[`domain:${id}`];expectStatus(await api('sibilla.micheli',globalPath,{method:'PUT',body:{revision:current.revision,positions,hiddenNodeIds:(current.hiddenNodeIds??[]).filter(key=>!owned.has(key.slice(7))),relations:current.relations.filter(link=>!owned.has(link.sourceId)&&!owned.has(link.targetId))}}),200,'remove only gesture graph fixtures');}
    for(const domain of domains){const current=expectStatus(await api('sibilla.micheli',`/api/v1/domains/${domain.id}`),200,'read gesture domain for cleanup').body;if(current.lifecycle==='active')expectStatus(await api('sibilla.micheli',`/api/v1/domains/${domain.id}/retire`,{method:'POST',etag:`"${current.revision}"`,body:{}}),200,'retire only gesture domain fixtures');}
  }
}

// Uses only local drafts: safe against an existing preview, with no graph writes.
// Read-only against the live preview: opens menus and stages/discards layout only.
// Existing relationships are changed only in a local draft, then discarded.
async function domainRelationTypesFlow(){
  const actor='sibilla.micheli';await navigate('/domains/network?ownOffice=0',actor,1440,1000);
  await waitFor("location.pathname==='/domains'&&new URLSearchParams(location.search).get('view')==='network'&&document.querySelector('.domain-network .graph-canvas')",'legacy network link did not open the embedded domain view');
  invariant(await evaluate("document.querySelectorAll('h1').length===1&&!document.querySelector('.semantic-tabs a[href=\"/domains/network\"]')&&new URL(document.querySelector('.semantic-tabs [aria-current=page]')?.href??location.href).pathname==='/domains'"),'domain network still has a separate tab or duplicate page heading');
  await clickText('.domain-view-switch button','Kacheln');
  await waitFor("!document.querySelector('daca-domain-network')&&document.querySelector('.domain-card')&&!new URLSearchParams(location.search).has('view')",'domain cards view did not open');
  await clickText('.domain-view-switch button','Dom\u00e4nennetz');
  await waitFor("document.querySelector('.domain-network .graph-canvas')&&new URLSearchParams(location.search).get('view')==='network'",'domain network button did not open the embedded graph');
  await captureScreenshot('domain-network-submenu.png');
  const baseline=expectStatus(await api(actor,'/api/v1/semantic-graphs/domains'),200,'read domain relation baseline').body;
  let index=baseline.relations.findIndex(link=>baseline.relationSourceNodeIds.includes('domain:'+link.sourceId));
  try{
    if(index<0){
      const source=await evaluate(`(()=>{const ids=${JSON.stringify(baseline.relationSourceNodeIds)};return [...document.querySelectorAll('[data-domain-id]')].find(node=>ids.includes('domain:'+node.dataset.domainId))?.dataset.domainId;})()`);
      invariant(source,'relation type preview requires an owned active domain');
      await evaluate(`document.querySelector('[data-domain-id="${source}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);
      await clickText('.concept-context-menu button','Neue Dom\u00e4nenbeziehung');
      const target=await evaluate(`(()=>{const node=[...document.querySelectorAll('.graph-node[data-domain-id]')].find(node=>node.dataset.domainId!==${JSON.stringify(source)});node.click();return node.dataset.domainId;})()`);
      await waitFor("document.querySelector('.relation-dialog')!==null",'new draft relationship editor missing');
      await clickText('.relation-dialog button','Entwurf \u00fcbernehmen');index=await evaluate("Number([...document.querySelectorAll('[data-domain-link]')].at(-1).getAttribute('data-domain-link'))");
    }
    for(const [type,label] of [['interfacesWith','hat eine fachliche Schnittstelle zu'],['overlapsWith','hat \u00dcberschneidungen mit']]){
      await evaluate(`document.querySelector('[data-domain-link="${index}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:350}))`);
      await clickText('.concept-context-menu button','Verbindungstyp \u00e4ndern');
      await waitFor("document.querySelector('.relation-dialog')!==null",'relationship type editor missing');
      const options=await evaluate("[...document.querySelectorAll('.relation-dialog select')[1].options].map(option=>option.value)");
      invariant(JSON.stringify(options)===JSON.stringify(['related','partOf','interfacesWith','overlapsWith']),'domain relationship dropdown is incomplete');
      await evaluate(`(()=>{const select=document.querySelectorAll('.relation-dialog select')[1];select.value=${JSON.stringify(type)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await captureScreenshot(`domain-relation-${type}-dialog.png`);
      await clickText('.relation-dialog button','Entwurf \u00fcbernehmen');
      await waitFor(`[...document.querySelectorAll('.graph-relationship text')].some(text=>text.textContent===${JSON.stringify(label)})&&!document.querySelector('.relation-dialog')`,'selected relationship label did not appear in the graph');
      index=await evaluate("Number([...document.querySelectorAll('[data-domain-link]')].at(-1).getAttribute('data-domain-link'))");
    }
    await evaluate("window.__domainViewConfirm=window.confirm;window.confirm=()=>false");
    try { await clickText('.domain-view-switch button','Kacheln'); await settleFrames(); } finally { await evaluate("window.confirm=window.__domainViewConfirm;delete window.__domainViewConfirm"); }
    invariant(await evaluate("!!document.querySelector('daca-domain-network')&&document.querySelectorAll('.domain-view-switch button')[1].getAttribute('aria-pressed')==='true'"),'cancelled view switch discarded a dirty domain graph');
  }finally{
    await evaluate("(()=>{const discard=[...document.querySelectorAll('.domain-network .draft-actions button')].find(button=>button.textContent.includes('Entwurf verwerfen'));if(discard&&!discard.disabled)discard.click();})()");
  }
  invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/semantic-graphs/domains'),200,'verify graph baseline').body)===JSON.stringify(baseline),'relationship type preview saved a live graph change');
  console.log('PASS domain submenu and relationship types: legacy redirect, cards/network switch, single heading/current tab, dirty-view cancellation, dropdown options and local apply/discard; no graph writes');
}

async function domainTransferFlow(){
  await navigate('/domains?view=cards','sibilla.micheli');
  const domains=expectStatus(await api('sibilla.micheli','/api/v1/domains'),200,'read transfer domains').body;
  const defence=domains.find(item=>item.preferredLabel==='Verteidigung'),estate=domains.find(item=>item.preferredLabel==='Immobilienmanagement VBS');
  invariant(defence&&estate,'domain handover preview requires the existing domains');
  let mocked=false;
  for(const [actor,domain,allowed,width] of [['sibilla.micheli',estate,true,1440],['christian.spider',estate,true,1440],['christian.man',defence,true,390],['sandro.wenger',defence,true,1440],['thomas.kriegli',defence,false,1440],['christian.spider',defence,false,1440]]){
    await navigate('/domains?ownOffice=0&view=cards',actor,width,900);
    const baseline=expectStatus(await api(actor,'/api/v1/domains/'+domain.id),200,'read handover baseline').body;
    invariant(baseline.canTransferOwnership===allowed,'server handover rights are incorrect');
    const card=`.domain-card[data-domain-id="${domain.id}"]`;
    await evaluate(`document.querySelector('${card} .domain-actions-trigger').scrollIntoView({block:'center',behavior:'instant'})`);
    await clickText(card+' .domain-actions-trigger','');
    invariant(await evaluate(`!!document.querySelector('${card} [data-domain-action=transfer]')===${allowed}`),'card handover menu ignores its actor capability');
    if(!allowed){await pressKey('Escape','Escape',27);continue;}
    await clickText(card+' [data-domain-action=transfer]','Dom\u00e4ne abtreten');
    await waitFor("!!document.querySelector('daca-domain-transfer-dialog dialog[open]')",'handover dialog did not open');
    await setControls({'daca-domain-transfer-dialog input[name=query]':'cinthya'});
    await setControls({'daca-domain-transfer-dialog select[name=owner]':'cinthya.thor'});
    await setControls({'daca-domain-transfer-dialog input[name=query]':'hong'});
    await setControls({'daca-domain-transfer-dialog select[name=deputy]':'hong.an.captain','daca-domain-transfer-dialog textarea':'Lokale Vorschau einer bewussten Übergabe'});
    invariant(await evaluate("document.querySelector('daca-domain-transfer-dialog button[type=submit]').disabled"),'handover did not require confirmation');
    await evaluate("document.querySelector('daca-domain-transfer-dialog input[type=checkbox]').click()");
    await waitFor("!document.querySelector('daca-domain-transfer-dialog button[type=submit]').disabled",'confirmed handover form is invalid');
    invariant(await evaluate("(()=>{const rect=document.querySelector('daca-domain-transfer-dialog dialog').getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1;})()"),'handover dialog overflows its viewport');
    await captureScreenshot(`domain-handover-${actor}-${width}.png`);
    if(!mocked){
      cdp.mockTransferResponse={status:409,body:{status:409,detail:'Testkonflikt: Die Domäne wurde parallel geändert.'}};
      await cdp.call('Fetch.enable',{patterns:[{urlPattern:`${baseUrl}/api/v1/domains/${domain.id}/transfer`,requestStage:'Request'}]},sessionId);
      try{
        await clickText('daca-domain-transfer-dialog button[type=submit]','Verantwortung \u00fcbertragen');
        await waitFor("document.querySelector('daca-domain-transfer-dialog [role=alert]')?.textContent.includes('Testkonflikt')",'handover error did not retain its dialog');
        const request=cdp.interceptedTransfers.at(-1),payload=JSON.parse(request.postData);
        invariant(payload.ownerUserId==='cinthya.thor'&&payload.deputyOwnerUserId==='hong.an.captain','handover payload lost the selected people');
        invariant(Object.entries(request.headers).find(([name])=>name.toLowerCase()==='if-match')?.[1]===`"${baseline.revision}"`,'handover omitted its revision');
        invariant(await evaluate("document.querySelector('daca-domain-transfer-dialog select[name=owner]').value==='cinthya.thor'&&document.querySelector('daca-domain-transfer-dialog textarea').value.includes('bewussten')"),'handover error discarded entries');
        mocked=true;
      }finally{if(mocked)await cdp.call('Fetch.disable',{},sessionId);cdp.mockTransferResponse=null;}
    }
    await clickText('daca-domain-transfer-dialog footer button','Abbrechen');
    await waitFor("!document.querySelector('daca-domain-transfer-dialog')",'cancel did not close handover dialog');
    const after=expectStatus(await api(actor,'/api/v1/domains/'+domain.id),200,'verify cancelled handover').body;
    invariant(after.revision===baseline.revision&&after.ownerUserId===baseline.ownerUserId&&after.deputyOwnerUserId===baseline.deputyOwnerUserId,'handover preview changed live responsibilities');
    await navigate('/domains/'+domain.id,actor,width,900);
    invariant(await evaluate("!!document.querySelector('.domain-transfer-trigger')"),'detail handover action missing');
  }
  console.log('PASS domain handover: scoped owner/deputy/ALDS/LDSD menus, person search, confirmation, mobile, mocked conflict retention, revision header and cancellation; no catalog writes');
}

async function domainMetadataFlow(){
  await navigate('/domains?view=cards','sibilla.micheli');
  const domains=expectStatus(await api('sibilla.micheli','/api/v1/domains'),200,'read domains for metadata preview').body;
  const defence=domains.find(domain=>domain.preferredLabel==='Verteidigung'),vat=domains.find(domain=>domain.preferredLabel==='Mehrwertsteuer'),estate=domains.find(domain=>domain.preferredLabel==='Immobilienmanagement VBS'),rapid=domains.find(domain=>domain.preferredLabel==='Data Analytics Rapid Prototyping');
  invariant(defence&&vat&&estate&&rapid,'confirmed domain metadata fixtures are missing');
  for(const [actor,domain,allowed] of [['sibilla.micheli',defence,true],['sandro.wenger',defence,true],['christian.man',defence,true],['christian.spider',defence,false],['thomas.kriegli',vat,true],['joel.ruod',vat,true],['christian.man',vat,false],['christian.spider',estate,true],['joel.ruod',rapid,true],['thomas.kriegli',rapid,true]]){
    const width=actor==='thomas.kriegli'&&domain.id===rapid.id?390:1440;
    await navigate('/domains/'+domain.id,actor,width,900);
    const current=expectStatus(await api(actor,'/api/v1/domains/'+domain.id),200,'read actor domain metadata').body;
    invariant(current.canEditMetadata===allowed,'unexpected server metadata capability for '+actor+' / '+domain.preferredLabel);
    invariant(await evaluate(`!!document.querySelector('.domain-edit-trigger')===${allowed}`),'domain edit action does not match server rights');
    if(!allowed)continue;
    await clickText('.domain-edit-trigger','Dom\u00e4ne bearbeiten');
    await waitFor("document.querySelector('daca-domain-metadata-dialog dialog[open] input')!==null",'domain metadata dialog did not open');
    invariant(await evaluate("(()=>{const rect=document.querySelector('daca-domain-metadata-dialog dialog').getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1;})()"),'domain editor overflows the viewport');
    invariant(await evaluate(`document.querySelectorAll('daca-domain-metadata-dialog fieldset').length===${current.localizations.length}`),'domain editor lost an existing language');
    await setControls({'daca-domain-metadata-dialog textarea':'Nur lokaler Testentwurf'});
    await captureScreenshot(`domain-edit-${actor}-${domain.id}.png`);
    await clickText('daca-domain-metadata-dialog footer button','Abbrechen');
    await waitFor("!document.querySelector('daca-domain-metadata-dialog')",'domain edit cancel did not close');
    invariant(expectStatus(await api(actor,'/api/v1/domains/'+domain.id),200,'read cancelled domain').body.revision===current.revision,'cancelling wrote domain metadata');
  }
  await governanceInformationFlow();
  invariant(await evaluate("document.querySelector('#rollen-zustaendigkeiten').textContent.includes('LDSD')&&document.querySelector('#rollen-zustaendigkeiten').textContent.includes('Thomas Kriegli')"),'updated mandate documentation is missing');
  console.log('PASS domain metadata: owner/deputy, ALDS/deputy, foreign-office denial, subordinate office, confirmed new domain, languages, cancellation and static LDSD reference; no catalog writes');
}

async function semanticOwnOfficeFlow(){
  for(const actor of ['christian.spider','sibilla.micheli']){
    await navigate('/domains/terminology?view=network&ownOffice=0',actor,1440,1000);
    await waitFor("document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'office context did not load');
    const office=await evaluate("document.querySelector('.organization-choice select').value");
    invariant(office,'current identity has no resolved office');
    const scope=expectStatus(await api(actor,'/api/v1/semantic-graphs/organizations/'+office),200,'read own office scope').body;
    const domainGraph=expectStatus(await api(actor,'/api/v1/semantic-graphs/domains'),200,'read shared domains graph').body;
    for(const [route,kind,allowed] of [['/domains/terminology','term',scope.scopeTermIds],['/domains','domain',scope.scopeDomainIds]]){
      await navigate(route+'?view=cards',actor,1440,1000);
      await waitFor("document.querySelector('.office-filter [role=switch]')?.getAttribute('aria-checked')==='true'&&!document.querySelector('.office-filter .small-spinner')",'own-office filter is not active by default');
      invariant(await evaluate("(()=>{const search=document.querySelector('.semantic-search input').getBoundingClientRect(),filter=document.querySelector('.office-filter label').getBoundingClientRect();return filter.left>=search.right&&Math.abs(filter.top-search.top)<8;})()"),'Office toggle is not next to its search field');
      await navigate(route+'?ownOffice=0&view=cards',actor,1440,1000);
      const baseline=await evaluate("[...document.querySelectorAll('.semantic-grid>article')].map(card=>card.dataset.domainId??card.dataset.termId).sort()");
      await evaluate("document.querySelector('.office-filter [role=switch]').click()");
      const expected=baseline.filter(id=>allowed.includes(id)).sort();
      await waitFor(`location.search.includes('ownOffice=1')&&!document.querySelector('.office-filter .small-spinner')&&[...document.querySelectorAll('.semantic-grid>article')].map(card=>card.dataset.domainId??card.dataset.termId).sort().join(',')===${JSON.stringify(expected.join(','))}`,'own-office cards did not match server object scope');
      invariant(expected.length<baseline.length,'own-office fixture does not distinguish a foreign office');
      await evaluate("document.querySelector('.office-filter [role=switch]').blur();document.querySelector('.office-filter').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
      await evaluate("window.officeScrollTime=Date.now();window.addEventListener('scroll',()=>window.officeScrollTime=Date.now(),true)");
      await waitFor('Date.now()-window.officeScrollTime>400','page did not stop scrolling');
      await evaluate("document.querySelector('.office-filter [role=switch]').focus({preventScroll:true})");await settleFrames();
      await waitFor("document.querySelector('[role=tooltip]')!==null",'office filter tooltip did not open on keyboard focus');
      await captureScreenshot(`own-office-${actor}-${kind}-cards.png`);
      await evaluate("document.querySelector('.office-filter [role=switch]').blur()");
      await setViewport(390,844);await settleFrames();
      invariant(await evaluate("(()=>{const search=document.querySelector('.semantic-search input').getBoundingClientRect(),filter=document.querySelector('.office-filter label').getBoundingClientRect();return filter.top>=search.bottom&&filter.right<=innerWidth;})()"),'Mobile toggle does not stack below search');
      await evaluate("document.querySelector('.semantic-filter-row').scrollIntoView({block:'center',behavior:'instant'})");
      await captureScreenshot(`own-office-${actor}-${kind}-mobile-search.png`);
      await setViewport(1440,1000);
      await clickText('.term-view-switch button',kind==='domain'?'Domänennetz':'Termnetz');
      await waitFor(kind==='domain'?"document.querySelector('.domain-network')!==null":"document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'filtered network did not load');
      const selector=kind==='domain'?'.domain-network [data-domain-id]':'.network-editor [data-node-id]';
      const visible=await evaluate(`[...document.querySelectorAll('${selector}')].map(card=>card.dataset.domainId??card.dataset.nodeId)`);
      invariant(visible.every(id=>kind==='domain'?scope.scopeDomainIds.includes(id):[...scope.scopeDomainIds.map(id=>'domain:'+id),...scope.scopeTermIds.map(id=>'term:'+id)].includes(id)),'foreign reference leaked through the network filter');
      if(kind==='term')invariant(await evaluate("!document.querySelector('.organization-choice')"),'own-office network retained a foreign-office selector');
      await capturePageSegmentScreenshot(kind==='domain'?'.domain-network':'.network-editor',`own-office-${actor}-${kind}-network.png`,1440,1000);
      await setViewport(390,844);await settleFrames();
      invariant(await evaluate("document.querySelector('.office-filter').getBoundingClientRect().right<=innerWidth+1"),'office filter overflowed on mobile');
      await evaluate("document.querySelector('.office-filter').scrollIntoView({block:'start'})");
      await captureScreenshot(`own-office-${actor}-${kind}-mobile.png`);
      await setViewport(1440,1000);
      await evaluate("document.querySelector('.office-filter [role=switch]').click()");
      await waitFor("location.search.includes('ownOffice=0')",'clearing own-office filter did not update the URL');
      if(kind==='term')invariant(await evaluate("!!document.querySelector('.organization-choice')"),'organization selector did not return');
      await clickText('.term-view-switch button','Kacheln');
      await waitFor(`document.querySelectorAll('.semantic-grid>article').length===${baseline.length}`,'clearing filter lost catalog cards');
      const other=kind==='domain'?'/domains/terminology':'/domains';
      invariant(await evaluate(`document.querySelector('.semantic-tabs a[href^="${other}"]')?.getAttribute('href').includes('ownOffice=0')`),'Explicit All was not retained in the other semantic tab link');
    }
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/semantic-graphs/domains'),200,'verify domain graph unchanged').body)===JSON.stringify(domainGraph),'filtering changed the shared domain graph');
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/semantic-graphs/organizations/'+office),200,'verify office graph unchanged').body)===JSON.stringify(scope),'filtering changed the office graph');
    await navigate('/domains?ownOffice=1',actor);
    await evaluate("document.querySelector('.semantic-tabs a[href^=\"/domains/terminology\"]').click()");
    await waitFor("location.pathname==='/domains/terminology'&&document.querySelector('.office-filter [role=switch]')?.getAttribute('aria-checked')==='true'",'own-office filter was lost between semantic tabs');
  }
  console.log('PASS own-office filter: trusted independent scopes, both identities, cards/networks, tooltip, mobile, clearing, tab/URL retention, no graph writes');
}

async function semanticOwnerSearchFlow(){
  const normalize=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('de-CH');
  for(const route of ['/domains','/domains/terminology']){
    await navigate(route+'?ownOffice=0&view=cards','sibilla.micheli');
    const baseline=await evaluate("[...document.querySelectorAll('.semantic-grid>article')].map(card=>({id:card.dataset.domainId??card.dataset.termId,owners:[...card.querySelectorAll('dl>div')].filter(row=>['Data Owner','Stellvertretung'].includes(row.querySelector('dt')?.textContent)).map(row=>row.querySelector('dd').textContent.split(' · ')[0].trim())}))");
    invariant(baseline.length&&baseline[0].owners.length===2,'owner search requires visible owner and deputy fixtures');
    for(const person of baseline[0].owners){
      const query=normalize(person).toUpperCase(),expected=baseline.filter(card=>card.owners.some(owner=>normalize(owner).includes(normalize(query)))).map(card=>card.id).sort();
      await setControls({'.semantic-search input':query});
      await waitFor(`[...document.querySelectorAll('.semantic-grid>article')].map(card=>card.dataset.domainId??card.dataset.termId).sort().join(',')===${JSON.stringify(expected.join(','))}`,'owner/deputy search did not match the visible object responsibilities');
    }
    await captureScreenshot(route==='/domains'?'domain-owner-search.png':'term-owner-search.png');
    await setControls({'.semantic-search input':''});
    invariant(await evaluate(`document.querySelectorAll('.semantic-grid>article').length===${baseline.length}`),'clearing owner search did not restore the cards');
  }
  console.log('PASS semantic owner search: domain and term owners/deputies, case/accent normalization, clearing; no catalog writes');
}

async function organizationTermNetworkFlow(){
  for(const [actor,organizationId] of [['christian.spider','vbs-armasuisse-immobilien'],['sibilla.micheli','vbs-verteidigung']]){
    await navigate('/domains/terminology?view=network&ownOffice=0',actor,1440,1000);
    await waitFor("document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'organization term network did not load');
    invariant(await evaluate(`document.querySelector('.organization-choice select')?.value===${JSON.stringify(organizationId)}`),'term network default did not follow the current modeling organization: '+JSON.stringify(await evaluate("({selected:document.querySelector('.organization-choice select')?.value,scope:document.querySelector('.scope-description')?.textContent,body:document.body.innerText.slice(0,600)})")));
    // Reload the existing cookie/local identity without the demoUser bootstrap shortcut.
    await navigate('/domains/terminology?view=network&ownOffice=0',null,1440,1000);
    await waitFor(`document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'&&document.querySelector('.organization-choice select')?.value===${JSON.stringify(organizationId)}`,'existing session did not reload its organization network');
    invariant(expectStatus(await api(actor,'/api/v1/session'),200,'read restored session').body.userId===actor,'reload changed the active person');
    const graph=expectStatus(await api(actor,'/api/v1/semantic-graphs/organizations/'+organizationId),200,'read expected organization graph').body;
    const actual=await evaluate("[...document.querySelectorAll('.network-editor [data-node-id]')].map(node=>node.dataset.nodeId).sort()");
    const expected=[...graph.scopeDomainIds.map(id=>'domain:'+id),...graph.scopeTermIds.map(id=>'term:'+id)].filter(id=>!graph.hiddenNodeIds.includes(id));
    for(const id of expected)invariant(actual.includes(id),'organization object is missing from the term graph: '+id);
    invariant(actual.every(id=>expected.includes(id)||graph.additionalNodeIds.includes(id)),'an unrelated organization object leaked into the term graph');
    await evaluate('window.scrollTo(0,0)');await captureScreenshot(`term-network-session-${actor}.png`);
    await capturePageSegmentScreenshot('daca-organization-term-network',`term-network-${actor}.png`,1440,1000);
    if(actor==='sibilla.micheli'){
      const term=await evaluate("document.querySelector('.network-editor [data-term-id]')?.dataset.termId");invariant(term,'defense term network should contain existing terms');
      await evaluate(`document.querySelector('[data-term-id="${term}"] header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))`);
      await waitFor("!document.querySelector('.layout-actions button').disabled",'term network move did not stage layout');
      await clickText('.layout-actions button','Layout verwerfen');
      invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/semantic-graphs/organizations/'+organizationId),200,'verify unsaved organization layout').body)===JSON.stringify(graph),'local layout movement persisted automatically');
      const selected=await evaluate("(()=>{const select=document.querySelector('.organization-choice select');select.value='vbs-armasuisse-immobilien';select.dispatchEvent(new Event('change',{bubbles:true}));return select.value;})()");
      invariant(selected==='vbs-armasuisse-immobilien','organization selector did not switch');
      await waitFor("document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'&&document.querySelector('.scope-description')?.textContent.includes('armasuisse')",'organization switch retained stale cards');
    }
  }
  await navigate('/domains/terminology?view=cards','sibilla.micheli');
  await waitFor("document.querySelector('.term-card .term-actions-trigger')!==null",'term card overflow trigger missing');
  invariant(await evaluate("[...document.querySelectorAll('.term-card')].every(card=>card.querySelectorAll('button').length===1)"),'term cards still expose separate action buttons');
  const card=await evaluate("document.querySelector('.term-card').dataset.termId"),selector=`.term-card[data-term-id="${card}"]`;
  await clickText(selector+' .term-actions-trigger','');
  await waitFor(`document.querySelectorAll('${selector} [role=menuitem]').length===3`,'term actions were lost from the compact menu');
  invariant(await evaluate(`document.querySelector('${selector} [data-term-action=termdat]').disabled&&getComputedStyle(document.querySelector('${selector} [role=menuitem]')).fontSize==='14px'`),'TERMDAT state or compact menu font is incorrect');
  await capturePageSegmentScreenshot(selector,'term-actions-desktop.png',1440,1000);
  await pressKey('Escape','Escape',27);
  await waitFor(`document.activeElement===document.querySelector('${selector} .term-actions-trigger')`,'term action menu did not restore focus');
  await setViewport(390,844);await evaluate(`document.querySelector('${selector} .term-actions-trigger').scrollIntoView({block:'center',behavior:'instant'})`);await settleFrames();
  await clickText(selector+' .term-actions-trigger','');
  invariant(await evaluate(`(()=>{const rect=document.querySelector('${selector} [role=menu]').getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1;})()`),'term action menu overflows mobile viewport');
  await captureScreenshot('term-actions-mobile.png');
  await pressKey('Escape','Escape',27);
  console.log('PASS organization term network: persona defaults, exact object scope, organization switch, discardable layout, compact term menus and disabled TERMDAT, desktop/mobile; no catalog writes');
}

async function domainConnectionGestureFlow() {
  const actor='sibilla.micheli',graphPath='/api/v1/semantic-graphs/domains';
  await navigate('/domains/network?ownOffice=0',actor);
  const baseline=expectStatus(await api(actor,graphPath),200,'read gesture baseline').body;
  const sources=baseline.relationSourceNodeIds??[];
  const domains=expectStatus(await api(actor,'/api/v1/domains'),200,'read gesture domains').body;
  const source=domains.find(domain=>domain.lifecycle==='active'&&sources.includes('domain:'+domain.id));
  invariant(source,'gesture preview needs an existing owned domain');
  const target=domains.find(domain=>domain.lifecycle==='active'&&domain.id!==source.id&&!baseline.relations.some(link=>[link.sourceId,link.targetId].includes(source.id)&&[link.sourceId,link.targetId].includes(domain.id)));
  invariant(target,'gesture preview needs an unconnected active target');
  const sourceCard=`[data-domain-id="${source.id}"]`,targetCard=`[data-domain-id="${target.id}"]`;
  const baselinePorts=await evaluate("document.querySelectorAll('.domain-network .ontology-port').length");
  try {
    for(const [width,height,startPart,endPart] of [[1440,1000,'p','header'],[390,844,'header','p']]){
      await setViewport(width,height);
      await evaluate("document.querySelector('.domain-network .canvas-tools button:last-child').click()");
      // The overview's local automatic arrangement is discardable like every card move.
      await clickText('.domain-network .draft-actions button','Automatisch anordnen');
      if(width<500)for(let i=0;i<2;i++)await clickText('.domain-network .graph-controls button','\u2212');
      await settleFrames();
      const points=await evaluate(`(()=>{const a=document.querySelector('${sourceCard} ${startPart}').getBoundingClientRect(),b=document.querySelector('${targetCard} ${endPart}').getBoundingClientRect();return{from:{x:a.left+a.width/2,y:a.top+4},to:{x:b.left+b.width/2,y:b.top+4},style:document.querySelector('${sourceCard}').style.cssText,ports:document.querySelectorAll('.domain-network .ontology-port').length};})()`);
      invariant(points.to.x>0&&points.to.x<width&&points.to.y>0&&points.to.y<height,'target must be visible for a real mouse drop');
      await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.from},sessionId);
      await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1},sessionId);
      await sleep(70);
      await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.from.x+5,y:points.from.y+3,buttons:1},sessionId);
      await waitFor("document.querySelector('.domain-network .hold-line')!==null",'small mouse jitter cancelled the held connection');
      invariant(await evaluate(`document.querySelector('${sourceCard}').style.cssText===${JSON.stringify(points.style)}`),'pending hold moved the source card');
      await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.to,buttons:1},sessionId);
      await captureScreenshot(`domain-connection-red-${width}.png`);
      await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1},sessionId);
      await waitFor(`document.querySelectorAll('[data-domain-link]').length===${baseline.relations.length+1}&&!document.querySelector('.domain-network .relation-dialog')`,'held drop did not draw a local connection');
      invariant(await evaluate(`document.querySelector('${sourceCard}').style.cssText===${JSON.stringify(points.style)}&&document.querySelector('${sourceCard} .ontology-port')!==null&&document.querySelector('${targetCard} .ontology-port')!==null`),'connected endpoints missing or source moved');
      invariant(await evaluate("[...document.querySelectorAll('.domain-network .graph-node')].every(node=>node.querySelectorAll('.ontology-port').length<=2)"),'unexpected extra connection points');
      await captureScreenshot(`domain-connection-blue-${width}.png`);
      await clickText('.domain-network .draft-actions button','Entwurf verwerfen');
      await waitFor(`document.querySelectorAll('[data-domain-link]').length===${baseline.relations.length}`,'discard did not restore connection visibility');
      invariant(await evaluate(`document.querySelectorAll('.domain-network .ontology-port').length===${baselinePorts}`),'unconnected ports remained after discard');
      await evaluate("document.querySelector('.domain-network .canvas-tools button:last-child').click()");
    }
  } finally {
    await evaluate("(()=>{const discard=[...document.querySelectorAll('.domain-network .draft-actions button')].find(button=>button.textContent.includes('Entwurf verwerfen'));if(discard&&!discard.disabled)discard.click();})()");
  }
  const after=expectStatus(await api(actor,graphPath),200,'verify graph was not saved').body;
  invariant(JSON.stringify(after)===JSON.stringify(baseline),'local gesture check changed persisted graph state');
  // The same hold helper and conditional ports also serve a domain's term network.
  await navigate('/domains/'+source.id,actor,1440,1000);
  await waitFor("document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'term graph did not load');
  const termBefore=expectStatus(await api(actor,`/api/v1/semantic-graphs/concepts/${source.id}`),200,'read term layout baseline').body;
  await evaluate("document.querySelector('.network-editor').requestFullscreen=undefined;document.querySelector('.network-editor .fullscreen-toggle').click()");
  for(let i=0;i<2;i++)await clickText('.network-editor .graph-controls button','\u2212');
  await settleFrames();
  const terms=await evaluate(`(()=>{const viewport=document.querySelector('.network-editor .semantic-graph').getBoundingClientRect();return [...document.querySelectorAll('[data-term-id]')].map(card=>{const r=card.querySelector('p').getBoundingClientRect();return{id:card.dataset.termId,x:r.left+r.width/2,y:r.top+4};}).filter(point=>point.x>viewport.left+8&&point.x<Math.min(viewport.right,innerWidth)-8&&point.y>viewport.top+8&&point.y<Math.min(viewport.bottom,innerHeight)-8).slice(0,2);})()`);
  invariant(terms.length===2,'term gesture check requires two visible cards');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:terms[0].x,y:terms[0].y},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:terms[0].x,y:terms[0].y,button:'left',buttons:1,clickCount:1},sessionId);
  await sleep(70);await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:terms[0].x+5,y:terms[0].y+3,buttons:1},sessionId);
  await waitFor("document.querySelector('.network-editor .hold-line')!==null",'term hold did not tolerate mouse jitter');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:terms[1].x,y:terms[1].y,buttons:1},sessionId);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:terms[1].x,y:terms[1].y,button:'left',buttons:0,clickCount:1},sessionId);
  await waitFor(`document.querySelector('.relation-dialog')?.getAttribute('data-target-id')==='${terms[1].id}'`,'held term drop did not select the actual target');
  await clickText('.relation-dialog button','Abbrechen');
  invariant(JSON.stringify(expectStatus(await api(actor,`/api/v1/semantic-graphs/concepts/${source.id}`),200,'verify unchanged term layout').body)===JSON.stringify(termBefore),'term gesture changed the shared layout');
  console.log('PASS held domain connections: hand jitter, description/header targets, desktop/mobile, red preview, connected blue endpoints, discard; no graph writes');
}

async function domainProductLayoutFlow() {
  const actor='kassandra.valdata',path='/api/v1/domain-network/view',graphPath='/api/v1/semantic-graphs/domains';
  await navigate('/',actor,1440,1100);
  const baseline=expectStatus(await api(actor,path),200,'read product layout baseline').body;
  const shared=expectStatus(await api(actor,graphPath),200,'read product layout shared baseline').body;
  const domains=expectStatus(await api(actor,'/api/v1/domains'),200,'read product layout domains').body;
  const a=domains.find(domain=>domain.preferredLabel==='Mobilität & Logistik'),b=domains.find(domain=>domain.preferredLabel==='Mehrwertsteuer');
  invariant(a&&b,'product layout domains missing');
  try {
    expectStatus(await api(actor,path,{method:'PUT',body:{revision:baseline.revision,configuration:{schemaVersion:1,addedDomainIds:[],hiddenDomainIds:domains.filter(domain=>domain.id!==a.id&&domain.id!==b.id).map(domain=>domain.id),positions:{['domain:'+a.id]:{x:100,y:100},['domain:'+b.id]:{x:530,y:270}},visibleKinds:['product']}}}),200,'prepare personal product layout');
    // A local read-only edge fixture exercises both ports without changing shared relationships.
    cdp.mockReadResponses=new Map([[graphPath,{...shared,canEditRelations:true,relationSourceNodeIds:['domain:'+a.id],relations:[{sourceId:a.id,targetId:b.id,relationType:'related'}]}]]);
    await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/semantic-graphs/domains'}]},sessionId);
    await navigate('/domains?view=network&ownOffice=0',actor,1440,1100);
    await waitFor("document.querySelector('.domain-network .domain-asset.is-product')&&document.querySelectorAll('.domain-network .ontology-port').length===2",'domain ports/products did not load');
    await evaluate("document.querySelector('.domain-network .relationship-hit').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
    for(let zoom=0;zoom<3;zoom++){
      await settleFrames();
      const offsets=await evaluate(`(()=>{const path=document.querySelector('.domain-network .relationship-line'),m=path.getScreenCTM(),length=path.getTotalLength();return [['${a.id}',0],['${b.id}',length]].map(([id,at])=>{const p=path.getPointAtLength(at).matrixTransform(m),r=document.querySelector('[data-domain-id="'+id+'"] .ontology-port').getBoundingClientRect();return Math.hypot(p.x-r.left-r.width/2,p.y-r.top-r.height/2);});})()`);
      invariant(offsets.every(offset=>offset<2),`blue ports drift from line endpoints at zoom ${zoom}: ${offsets}`);
      invariant(await evaluate("!document.querySelector('.domain-network .edge-handles')"),'duplicate white endpoint handle remains');
      if(zoom<2)await evaluate("document.querySelector('.domain-network .graph-controls button:last-child').click()");
    }
    await evaluate("document.querySelector('.domain-network .fullscreen-toggle').click()");
    await waitFor("document.querySelector('.domain-network.is-fullscreen')",'product fullscreen did not open');
    const selector=await evaluate("'.domain-asset[data-asset-key=\"'+document.querySelector('.domain-asset.is-product').dataset.assetKey+'\"]'");
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);await settleFrames();
    const before=await evaluate(`(()=>{const asset=document.querySelector(${JSON.stringify(selector)}),r=asset.getBoundingClientRect();return{key:asset.dataset.assetKey,x:r.left+r.width/2,y:r.top+r.height/2,left:parseFloat(asset.style.left),top:parseFloat(asset.style.top),path:document.querySelector('.asset-edges path').getAttribute('d')};})()`);
    const targets=(await cdp.call('Target.getTargets')).targetInfos.filter(target=>target.type==='page').length;
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+60*step/4,y:before.y+36*step/4,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+60,y:before.y+36,button:'left',buttons:0,clickCount:1},sessionId);
    await waitFor("!document.querySelector('.domain-network .draft-actions button').disabled",'product drag did not create a draft');
    invariant(await evaluate(`parseFloat(document.querySelector(${JSON.stringify(selector)}).style.left)>${before.left+30}&&document.querySelector('.asset-edges path').getAttribute('d')!==${JSON.stringify(before.path)}`),'product/assignment line did not move');
    invariant((await cdp.call('Target.getTargets')).targetInfos.filter(target=>target.type==='page').length===targets,'dragging a product opened its link');
    await clickText('.domain-network .draft-actions button','Netz speichern');
    await waitFor("document.querySelector('.domain-network .draft-actions button').disabled&&document.querySelector('.domain-network .draft-actions button').textContent.trim()==='Netz speichern'",'product anchor did not save');
    const saved=expectStatus(await api(actor,path),200,'read saved product anchor').body;
    invariant(saved.configuration.positions[before.key]?.x>before.left,'saved view lacks product anchor');
    await capturePageSegmentScreenshot('.domain-network','domain-product-moved-fullscreen.png',1440,1100);
    await pressKey('Escape','Escape',27);
    await navigate('/domains?view=network&ownOffice=0',actor,1440,1100);
    await waitFor(`parseFloat(document.querySelector(${JSON.stringify(selector)})?.style.left)===${saved.configuration.positions[before.key].x}`,'product anchor did not survive reload');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await pressKey('ArrowRight','ArrowRight',39);
    await clickText('.domain-network .draft-actions button','Entwurf verwerfen');
    invariant(await evaluate(`parseFloat(document.querySelector(${JSON.stringify(selector)}).style.left)===${saved.configuration.positions[before.key].x}`),'discard did not restore product anchor');
    await clickText('.domain-network .draft-actions button','Automatisch anordnen');
    invariant(JSON.stringify(expectStatus(await api(actor,path),200,'verify automatic arrangement draft').body)===JSON.stringify(saved),'automatic arrangement saved unexpectedly');
    await clickText('.domain-network .draft-actions button','Netz speichern');await waitFor("document.querySelector('.domain-network .draft-actions button').disabled&&document.querySelector('.domain-network .draft-actions button').textContent.trim()==='Netz speichern'",'reset did not save');
    invariant(!expectStatus(await api(actor,path),200,'read reset product position').body.configuration.positions[before.key],'automatic arrangement retained visible manual product anchor');
    await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;
    invariant(JSON.stringify(expectStatus(await api(actor,graphPath),200,'verify shared graph unchanged').body)===JSON.stringify(shared),'product placement changed shared relationships');
    invariant(cdp.runtimeExceptions.length===0,`product placement errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS domain-product-layout: aligned single blue ports across zoom levels, selected endpoints, real product drag, no link navigation, updated lines, fullscreen, save/reload, keyboard/discard and automatic reset');
  } finally {
    await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;
    const current=expectStatus(await api(actor,path),200,'read product layout cleanup').body;
    expectStatus(await api(actor,path,{method:'PUT',body:{revision:current.revision,configuration:baseline.configuration}}),200,'restore personal product layout baseline');
  }
}

async function domainCardActionsFlow() {
  // This flow reads existing catalog metadata and opens/cancels dialogs only.
  const actor='sibilla.micheli';await navigate('/domains?ownOffice=0&view=cards',actor);
  const domains=expectStatus(await api(actor,'/api/v1/domains'),200,'read domains for card checks').body;
  const owned=domains.filter(domain=>domain.ownerUserId===actor||domain.deputyOwnerUserId===actor);
  const domain=owned.find(domain=>domain.preferredLabel==='Verteidigung')??owned[0];invariant(domain,'card preview needs an existing owned domain');
  const card=`.domain-card[data-domain-id="${domain.id}"]`;
  await waitFor(`document.querySelector('${card} .domain-actions-trigger')!==null`,'domain card action trigger missing');
  invariant(await evaluate(`document.querySelector('${card}').querySelectorAll('button').length===1&&document.querySelector('${card} .domain-card-heading').contains(document.querySelector('${card} daca-status-badge'))`),'domain card still has separate action buttons or a partial heading link');
  await clickText(card+' .domain-actions-trigger','');
  await waitFor(`document.querySelectorAll('${card} [role=menuitem]').length===${domain.canTransferOwnership?6:5}`,'owned domain menu is missing existing actions or authorized handover');
  await capturePageSegmentScreenshot('.semantic-grid','domain-cards-menu-desktop.png',1440,900);
  await pressKey('Escape','Escape',27);
  await waitFor(`!document.querySelector('${card} [role=menu]')&&document.activeElement===document.querySelector('${card} .domain-actions-trigger')`,'Escape did not close the domain menu and restore focus');
  await clickText(card+' .domain-actions-trigger','');await clickText(card+' [data-domain-action=edit]','');
  await waitFor("document.querySelector('.semantic-dialog input')===document.activeElement",'domain edit dialog did not receive keyboard focus');
  invariant(await evaluate("document.querySelector('#domain-request-title').textContent.includes('direkt')"),'menu did not open the existing direct edit dialog');
  await clickText('.semantic-dialog button','Abbrechen');
  await setViewport(390,844);
  await evaluate(`document.querySelector('${card}').scrollIntoView({block:'center',behavior:'instant'})`);await settleFrames();
  await clickText(card+' .domain-actions-trigger','');
  invariant(await evaluate(`(()=>{const r=document.querySelector('${card} [role=menu]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})()`),'domain card menu overflows the narrow viewport');
  await captureScreenshot('domain-card-menu-mobile.png');
  await pressKey('Escape','Escape',27);await setViewport(1440,900);
  const point=await evaluate(`(()=>{const header=document.querySelector('${card} .domain-card-heading');header.scrollIntoView({block:'center',behavior:'instant'});const r=header.getBoundingClientRect();return{x:r.left+8,y:r.top+8};})()`);
  await settleFrames();await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},sessionId);await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1},sessionId);
  await waitFor(`location.pathname==='/domains/${domain.id}'&&document.querySelector('daca-domain-detail h1')!==null`,'clicking the heading padding did not open the domain');
  await navigate('/domains?ownOffice=0&view=cards',actor);await waitFor(`document.querySelector('${card} .domain-card-heading')!==null`,'heading link did not reload');
  await evaluate(`document.querySelector('${card} .domain-card-heading').focus()`);await pressKey('Enter','Enter',13);
  await waitFor(`location.pathname==='/domains/${domain.id}'`,'domain heading cannot be opened with Enter');
  const otherActor=['kassandra.valdata','noemie.rochat','christian.man'].find(id=>![domain.ownerUserId,domain.deputyOwnerUserId].includes(id));
  await navigate('/domains?ownOffice=0&view=cards',otherActor);await waitFor(`document.querySelector('${card} .domain-actions-trigger')!==null`,'other-owner card did not load');
  await clickText(card+' .domain-actions-trigger','');
  invariant(await evaluate(`!document.querySelector('${card} [data-domain-action=edit]')&&!document.querySelector('${card} [data-domain-action=retire]')&&document.querySelector('${card} [role=menuitem][href]')!==null`),'domain menu changed object permission visibility');
  console.log('PASS domain cards: one action trigger, existing menu actions, edit dialog, Escape focus, mobile fit, padded header click, Enter and object permissions; no object writes');
}

async function governanceInformationFlow() {
  await navigate('/documentation','christian.man');
  invariant(await evaluate("document.querySelector('a[href=\"/documentation/static#rollen-zustaendigkeiten\"]')!==null"),'Information role reference is missing');
  await navigate('/documentation/static','christian.man');
  await waitFor("document.querySelectorAll('daca-governance-information tbody tr').length===19",'RACI reference is incomplete');
  invariant(await evaluate("!document.querySelector('#rollen-zustaendigkeiten thead').textContent.match(/\\b(?:VBS|SLDS)\\b/)"),'source reference includes an unwanted department abbreviation or nonexistent role');
  await setControls({'#documentation-text-search':'datendomanen'});
  await waitFor("document.querySelectorAll('.documentation-articles>article:not([hidden])').length===1&&!document.querySelector('#rollen-zustaendigkeiten').hidden",'documentation content search did not find normalized matrix text');
  await capturePageSegmentScreenshot('#rollen-zustaendigkeiten','information-roles.png',1440,1000);
  await capturePageSegmentScreenshot('.raci-scroll','information-raci.png',1440,1150);
  await setControls({'#documentation-text-search':'Unauffindbarer Suchtext'});
  await waitFor("document.querySelectorAll('.documentation-articles>article:not([hidden])').length===0&&document.querySelector('.documentation-search').textContent.includes('0')",'documentation search has no empty-result state');
  await evaluate("document.querySelector('.documentation-search button').click()");
  await waitFor("document.querySelectorAll('.documentation-articles>article:not([hidden])').length===5",'documentation search reset did not restore articles');
  console.log('PASS Information: object roles, LDS/ALDS reference, complete 19-row RACI, normalized text search, empty results and reset');
}

async function semanticPerformanceFlow() {
  const actor='kassandra.valdata';
  await navigate('/',actor);
  cdp.deferReadPaths=new Set(['/api/v1/glossary/terms','/api/v1/domain-change-requests','/api/v1/glossary/term-proposals']);cdp.deferredGenericReads=[];
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/*',requestStage:'Request'}]},sessionId);
  try {
    await navigate('/domains',actor,1440,1100);
    await waitFor("document.querySelectorAll('.domain-network [data-domain-id]').length>0",'domain network waited for unrelated reads');
    invariant(cdp.deferredGenericReads.length>=3,'background-read fixture did not pause terminology/governance');
    invariant(await evaluate("performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname==='/api/v1/domains').length===1"),'domains loaded more than once');
    await capturePageSegmentScreenshot('.domain-network','domains-ready-background-paused.png',1440,1100);
  } finally {
    cdp.deferReadPaths.clear();
    for(const request of cdp.deferredGenericReads)await cdp.call('Fetch.continueRequest',{requestId:request.requestId},request.sessionId);
    await cdp.call('Fetch.disable',{},sessionId);delete cdp.deferReadPaths;cdp.deferredGenericReads=[];
  }
  for(const route of ['/domains','/domains/terminology']) {
    await navigate(route,actor,1440,1100);
    await waitFor(route==='/domains'?"document.querySelectorAll('.domain-network [data-domain-id]').length>0":"document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'default semantic network missing');
    const requests=await evaluate("performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname==='/api/v1/domains').map(entry=>({duration:Math.round(entry.duration)}))");
    invariant(requests.length===1,'semantic entry repeated the domain register read: '+route);
    console.log('CHECK semantic performance',route,JSON.stringify(requests));
    await capturePageSegmentScreenshot(route==='/domains'?'.domain-network':'.network-editor',route==='/domains'?'default-domain-network.png':'default-terminology-network.png',1440,1100);
    await clickText('.term-view-switch button','Kacheln');
    await waitFor("new URLSearchParams(location.search).get('view')==='cards'&&document.querySelector('.semantic-grid')",'explicit card view was not retained');
  }
  invariant(cdp.runtimeExceptions.length===0,`Semantic default errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS semantic-performance: one register request per entry, domains render with terminology/governance paused, both networks default, explicit cards retained');
}

async function organizationViewOptionsFlow() {
  const actor='kassandra.valdata';
  await navigate('/?organization=efd',actor,1440,1100);
  await waitFor('document.querySelector("[data-hide-unrelated-switch]")&&document.querySelectorAll("[data-organization-id]").length>5','organization view controls missing');
  invariant(await evaluate(`(()=>{const switches=[...document.querySelectorAll('.org-layout-toolbar [role="switch"]')];return !document.querySelector('.org-navigation-row [role="switch"],daca-organization-canvas daca-canvas-selection-hint')&&switches.length===2&&switches[0].hasAttribute('data-hide-unrelated-switch')&&switches[0].getAttribute('aria-checked')==='true'&&switches[0].getAttribute('aria-label')==='Orgs ohne DP-Beziehungen ausblenden'&&switches[1].closest('.org-layer')&&switches[1].getAttribute('aria-checked')==='false'&&!document.querySelector('.organization-explorer').textContent.includes('Ungespeicherte Anordnung');})()`),'toolbar toggle order/defaults or removed text incorrect');
  invariant(await evaluate("[...document.querySelectorAll('.org-office,.org-satellite')].every(card=>[...card.querySelectorAll('dd')].some(count=>Number(count.textContent)>0))"),'empty organizations are visible by default');
  await capturePageSegmentScreenshot('.organization-explorer','organization-default-compact-toolbar.png',1440,1100);
  await evaluate("document.querySelector('[data-hide-unrelated-switch]').click()");await settleFrames();
  const before=await evaluate(`(()=>[...document.querySelectorAll('.org-office,.org-satellite')].map(card=>({id:card.dataset.organizationId,counts:[...card.querySelectorAll('dd')].map(item=>Number(item.textContent))})))()`);
  invariant(before.some(card=>card.counts.every(count=>count===0)),'no empty organizations available to test filter');
  invariant(before.some(card=>card.counts[0]>0&&card.counts[1]===0),'producer-only organization missing');
  invariant(await evaluate(`(()=>{const switches=[...document.querySelectorAll('.org-layout-toolbar [role="switch"]')];return switches.every(item=>item.getAttribute('aria-checked')==='false');})()`),'explicitly showing all organizations did not update the toggle');
  await evaluate("document.querySelector('[data-hide-unrelated-switch]').focus()");
  await waitFor("document.querySelector('.daca-glossary-tooltip.is-visible')?.textContent.includes('weder Datenprodukte bereitstellen noch Datenprodukte konsumieren')",'shared filter tooltip missing');
  await pressKey(' ','Space',32);await settleFrames();
  const visible=await evaluate("[...document.querySelectorAll('.org-office,.org-satellite')].map(card=>card.dataset.organizationId)");
  const expected=before.filter(card=>card.counts.some(count=>count>0)).map(card=>card.id);
  invariant(JSON.stringify([...visible].sort())===JSON.stringify([...expected].sort()),'filter removed active organizations or retained empty ones');
  invariant(await evaluate("document.querySelector('.org-focus-title').textContent.trim()==='EFD'&&document.querySelector('.org-layout-toolbar button').disabled"),'filter changed focused organization or dirtied saved layout');
  await capturePageSegmentScreenshot('.organization-explorer','organization-filter-enabled.png',1440,1100);
  await evaluate("document.querySelector('.org-focus').focus();document.querySelector('.org-focus').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}))");await settleFrames();
  await pressKey('End','End',35);
  invariant(await evaluate("document.activeElement.matches('[data-hide-unrelated-option][aria-checked=\"true\"]')"),'menu keyboard navigation does not reach checked visibility option');
  await capturePageSegmentScreenshot('.organization-explorer','organization-filter-context-menu.png',1440,1100);
  await pressKey('Enter','Enter',13);await settleFrames();
  invariant(await evaluate(`document.querySelectorAll('.org-office,.org-satellite').length===${before.length}&&document.querySelector('[data-hide-unrelated-switch]').getAttribute('aria-checked')==='false'`),'context menu did not restore all organizations');
  await evaluate("document.querySelector('.org-layer [role=switch]').click();document.querySelector('[data-hide-unrelated-switch]').click()");await settleFrames();
  await waitFor("document.querySelector('.org-domain-bubble')",'organization filter removed domain layer');
  await evaluate("document.querySelector('.org-domain-bubble').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");await settleFrames();
  invariant(await evaluate("!!document.querySelector('[data-hide-unrelated-option][aria-checked=\"true\"]')"),'domain menu lacks shared visibility option');
  await pressKey('Escape','Escape',27);await settleFrames();
  await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();
  invariant(await evaluate("!!document.querySelector('.organization-explorer.is-fullscreen .org-layout-toolbar [data-hide-unrelated-switch][aria-checked=\"true\"]')"),'fullscreen lost visibility control/state');
  await captureScreenshot('organization-filter-fullscreen.png');
  await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();
  await setViewport(390,844);await settleFrames();
  invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'organization filters overflow mobile page');
  invariant(await evaluate(`(()=>{const switches=[...document.querySelectorAll('.org-view-filters [role=switch]')];return switches.every(item=>{const rect=item.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth;});})()`),'mobile filter controls clipped');
  await capturePageSegmentScreenshot('.org-layout-toolbar','organization-filter-mobile.png',390,844);
  invariant(cdp.runtimeExceptions.length===0,'organization filter caused browser errors: '+JSON.stringify(cdp.runtimeExceptions));
  console.log('PASS organization-view-options: supply/consumption filter, shared tooltip, keyboard organization/domain context menus, unchanged saved view, fullscreen and mobile');
}

async function canvasCardStylesFlow() {
  const actor='marcello.hebeisa';
  await navigate('/',actor,1440,1100);
  const domains=expectStatus(await api(actor,'/api/v1/domains'),200,'read card-style domains').body;
  const rohs=domains.filter(domain=>domain.preferredLabel.startsWith('ROHS'));
  invariant(rohs.length>=2,'ROHS card-style fixtures missing');
  const view=expectStatus(await api(actor,'/api/v1/domain-network/view'),200,'read card-style view').body;
  cdp.mockReadResponses=new Map([['/api/v1/domain-network/view',{...view,revision:Math.max(1,view.revision),configuration:{schemaVersion:1,addedDomainIds:rohs.map(domain=>domain.id),hiddenDomainIds:domains.filter(domain=>!rohs.includes(domain)).map(domain=>domain.id),positions:{},visibleKinds:['product','term','logical','physical']}}]]);
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/domain-network/view'}]},sessionId);
  const check=async(selector,token,side='borderLeftColor')=>{
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`,'typed card missing: '+selector);
    const color=await evaluate(`(()=>{const card=document.querySelector(${JSON.stringify(selector)}),probe=document.createElement('i');probe.style.color='var('+${JSON.stringify(token)}+')';document.body.append(probe);const actual=getComputedStyle(card)[${JSON.stringify(side)}],expected=getComputedStyle(probe).color;probe.remove();return{actual,expected};})()`);
    invariant(color.actual===color.expected,'wrong canvas type stripe: '+selector+' '+JSON.stringify(color));
  };
  const cardMetrics=selector=>evaluate(`(()=>{const card=document.querySelector(${JSON.stringify(selector)}),style=getComputedStyle(card),type=getComputedStyle(card.querySelector('.canvas-object-type')),title=getComputedStyle(card.querySelector('.canvas-object-title')),detail=getComputedStyle(card.querySelector('.canvas-object-detail'));return{width:card.offsetWidth,height:card.offsetHeight,padding:style.padding,border:style.borderLeftWidth,radius:style.borderRadius,background:style.backgroundColor,typeFont:type.fontSize,typeColor:type.color,titleFont:title.fontSize,titleWeight:title.fontWeight,titleLineHeight:title.lineHeight,detailFont:detail.fontSize};})()`);
  try{
    await navigate('/domains?view=network&ownOffice=0',actor,1440,1100);
    const domainCardMetrics=await cardMetrics('.domain-asset.is-product');
    for(const kind of ['product','term','logical','physical'])await check(`.domain-asset[data-canvas-kind="${kind}"]`,'--daca-canvas-'+kind);
    await capturePageSegmentScreenshot('.domain-network','canvas-type-colors-domains.png',1440,1100);
    await navigate('/domains/terminology?view=network','kassandra.valdata',1440,1100);
    await check('.network-editor .graph-node.is-term','--daca-canvas-term','borderTopColor');
    await capturePageSegmentScreenshot('.network-editor','canvas-type-colors-terms.png',1440,1100);
    await navigate('/models/83cb48b4-32b4-5bc9-b613-1036c3cb2e77/mappings','christian.man',1440,1100);
    await clickText('.mapping-toolbar nav button','Graph');
    await check('.logical-node[data-canvas-kind] > header','--daca-canvas-logical','borderTopColor');
    await check('.physical-representation > header','--daca-canvas-physical','borderTopColor');
    await capturePageSegmentScreenshot('.mapping-shell','canvas-type-colors-models.png',1440,1100);
    await navigate('/products/11111111-1111-4111-8111-111111111111/lineage','kassandra.valdata',1440,1100);
    await check('.lineage-node.is-product','--daca-canvas-product');
    const lineageCardMetrics=await cardMetrics('.lineage-node.is-product');
    invariant(JSON.stringify(lineageCardMetrics)===JSON.stringify(domainCardMetrics),'Lineage typography/spacing differs from domain asset cards: '+JSON.stringify({domainCardMetrics,lineageCardMetrics}));
    await capturePageSegmentScreenshot('.lineage-canvas-card','canvas-type-colors-lineage.png',1440,1100);
    for(const language of ['de','fr','it','rm','en']){
      await navigate('/?organization=efd','kassandra.valdata',1440,1100);
      await evaluate(`localStorage.setItem('daca.preference.kassandra.valdata.language',${JSON.stringify(language)})`);
      await navigate('/?organization=efd','kassandra.valdata',1440,1100);
      await waitFor("document.querySelector('.org-office daca-organization-card-content')",'organization card did not render');
      await check('.org-office','--daca-canvas-organization');await check('.org-satellite','--daca-canvas-organization');
      const cards=await evaluate(`(()=>[...document.querySelectorAll('.org-office,.org-satellite')].map(card=>{const content=card.querySelector('daca-organization-card-content'),counts=[...card.querySelectorAll('dd')],rect=card.getBoundingClientRect();return{id:card.dataset.organizationId,count:counts.map(item=>Number(item.textContent)),labels:[...card.querySelectorAll('dt')].map(item=>item.textContent),radius:getComputedStyle(card).borderRadius,inset:rect.height-content.getBoundingClientRect().height,fits:content.getBoundingClientRect().height<=rect.height-10&&content.scrollWidth<=content.clientWidth+1};}))()`);
      invariant(cards.every(card=>card.count.length===2&&card.labels.every(Boolean)&&card.radius==='2px'&&card.fits&&card.inset>=12&&card.inset<=16),'organization content does not fit in '+language+': '+JSON.stringify(cards));
      const network=expectStatus(await api('kassandra.valdata','/api/v1/organization-network'),200,'read displayed organization counts').body;
      invariant(cards.every(card=>{const node=network.nodes.find(node=>node.id===card.id);return node&&node.productCount===card.count[0]&&node.consumedProductCount===card.count[1];}),'organization card supply/consumption differs from catalog');
      if(language==='de'){
        await capturePageSegmentScreenshot('.organization-explorer','canvas-type-colors-organizations.png',1440,1100);
        await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();
        invariant(await evaluate("[...document.querySelectorAll('.org-office,.org-satellite')].every(card=>Math.abs(card.getBoundingClientRect().height-card.querySelector('daca-organization-card-content').getBoundingClientRect().height-14)<2)"),'fullscreen organization content overflows');
        await captureScreenshot('canvas-type-colors-organizations-fullscreen.png');
        await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();
      }
      if(language==='fr')await capturePageSegmentScreenshot('.organization-explorer','canvas-type-colors-organizations-fr.png',1440,1100);
    }
    await evaluate("localStorage.removeItem('daca.preference.kassandra.valdata.language');document.documentElement.setAttribute('data-daca-theme','dark')");
    await check('.org-office','--daca-canvas-organization');
    await capturePageSegmentScreenshot('.organization-explorer','canvas-type-colors-organizations-dark.png',1440,1100);
    await setViewport(390,844);await settleFrames();
    invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'organization cards overflow mobile page');
    await captureScreenshot('canvas-type-colors-organizations-mobile.png');
    invariant(cdp.runtimeExceptions.length===0,`Card style browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS canvas-card-styles: semantic type stripes across domains/terms/Mapping/Lineage, organization counts and fitting cards in DE/FR/IT/RM/EN, dark theme and mobile scrolling');
  }finally{await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;}
}

async function canvasSelectionFlow() {
  const cases=[
    ['domains','/domains?view=network&ownOffice=0','kassandra.valdata','.domain-network','.graph-canvas'],
    ['organizations','/?organization=all','kassandra.valdata','.organization-explorer','.org-stage'],
    ['models','/models/83cb48b4-32b4-5bc9-b613-1036c3cb2e77/mappings','christian.man','.mapping-shell','.graph-canvas'],
    ['terms','/domains/terminology?view=network','kassandra.valdata','.network-editor','.graph-canvas'],
  ];
  await navigate('/','kassandra.valdata',1440,1200);
  const domains=expectStatus(await api('kassandra.valdata','/api/v1/domains'),200,'selection domains').body;
  const mobility=domains.find(domain=>domain.preferredLabel==='Mobilität & Logistik');
  invariant(mobility,'selection fixture domain missing');
  const baseline=expectStatus(await api('kassandra.valdata','/api/v1/domain-network/view'),200,'selection view').body;
  // A read-only layout fixture makes the four term cards visible together; no catalog or layout writes.
  cdp.mockReadResponses=new Map([['/api/v1/domain-network/view',{...baseline,configuration:{schemaVersion:1,addedDomainIds:[],hiddenDomainIds:domains.filter(domain=>domain.id!==mobility.id).map(domain=>domain.id),positions:{['domain:'+mobility.id]:{x:60,y:30}},visibleKinds:['term']}}]]);
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/domain-network/view'}]},sessionId);
  try {
    for(const [name,route,actor,shell,canvas] of cases){
      await navigate(route,actor,1440,1200);
      if(name==='models')await clickText('.mapping-toolbar nav button','Graph');
      const root=shell+' '+canvas;
      await waitFor(`document.querySelectorAll(${JSON.stringify(root+' [data-canvas-object]')}).length>=2`,'selection objects missing: '+name);
      await evaluate(`document.querySelector(${JSON.stringify(shell+' .canvas-fullscreen-toggle')}).click()`);
      await waitFor(`document.querySelector(${JSON.stringify(shell)})?.classList.contains('is-fullscreen')`,'selection fullscreen missing: '+name);await settleFrames();
      if(name==='domains'){
        await waitFor("document.querySelectorAll('.domain-asset.is-term').length>=2",'selection terms missing');
        await evaluate("document.querySelector('.domain-asset').scrollIntoView({block:'center',inline:'center',behavior:'instant'})");await settleFrames();
        const rect=await evaluate(`(()=>{const cards=[...document.querySelectorAll('.domain-asset')].map(card=>card.getBoundingClientRect());return{left:Math.min(...cards.map(r=>r.left))-8,top:Math.min(...cards.map(r=>r.top))-8,right:Math.max(...cards.map(r=>r.right))+8,bottom:Math.max(...cards.map(r=>r.bottom))+8};})()`);
        invariant(rect.top>0&&rect.bottom<1200&&rect.left>0&&rect.right<1440,'selection rectangle outside visible domain canvas: '+JSON.stringify(rect));
        await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.left,y:rect.top},sessionId);
        await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.left,y:rect.top,button:'left',buttons:1,clickCount:1},sessionId);
        for(let step=1;step<=10;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.left+(rect.right-rect.left)*step/10,y:rect.top+(rect.bottom-rect.top)*step/10,buttons:1},sessionId);
        await captureScreenshot('canvas-selection-domain-marquee.png');
        await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.right,y:rect.bottom,button:'left',buttons:0,clickCount:1},sessionId);
        invariant(await evaluate("document.querySelectorAll('.domain-asset[data-canvas-selected]').length===document.querySelectorAll('.domain-asset').length&&!document.querySelector('.graph-node[data-canvas-selected]')"),'rectangle must select only enclosed term cards');
        const count=await evaluate("document.querySelectorAll('.domain-asset[data-canvas-selected]').length"),tabs=(await cdp.call('Target.getTargets')).targetInfos.length;
        const toggle=await evaluate("(()=>{const r=document.querySelector('.domain-asset header').getBoundingClientRect();return{x:r.left+15,y:r.top+10};})()");
        for(const expected of [count-1,count]){
          await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...toggle,button:'left',buttons:1,clickCount:1,modifiers:2},sessionId);
          await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...toggle,button:'left',buttons:0,clickCount:1,modifiers:2},sessionId);await settleFrames();
          invariant(await evaluate("document.querySelectorAll('.domain-asset[data-canvas-selected]').length")===expected,'Ctrl-click did not toggle a term card');
        }
        invariant((await cdp.call('Target.getTargets')).targetInfos.length===tabs,'Ctrl-selection unexpectedly opened a details tab');
      }else{
        await evaluate(`document.querySelector(${JSON.stringify(root)}).focus({preventScroll:true})`);
        await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2},sessionId);
        await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2},sessionId);
      }
      await waitFor(`document.querySelectorAll(${JSON.stringify(root+' [data-canvas-selected]')}).length>=2`,'group selection missing: '+name);
      const selected=await evaluate(`(()=>[...document.querySelectorAll(${JSON.stringify(root+' [data-canvas-selected]')})].map(element=>({id:element.dataset.canvasObject,x:parseFloat(element.style.left),y:parseFloat(element.style.top)})))()`);
      const selector=root+' [data-canvas-object="'+selected[0].id+'"]';
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);await settleFrames();
      const start=await evaluate(`(()=>{const card=document.querySelector(${JSON.stringify(selector)}),header=card.querySelector('header')??card,r=header.getBoundingClientRect();return{x:r.left+15,y:r.top+18};})()`);
      const currentPath=await evaluate('location.pathname');
      await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1},sessionId);
      await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+24,y:start.y+18,buttons:1},sessionId);await settleFrames();
      await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+24,y:start.y+18,button:'left',buttons:0,clickCount:1},sessionId);await settleFrames();
      const after=await evaluate(`(()=>[...document.querySelectorAll(${JSON.stringify(root+' [data-canvas-selected]')})].map(element=>({id:element.dataset.canvasObject,x:parseFloat(element.style.left),y:parseFloat(element.style.top)})))()`);
      invariant(after.length===selected.length,'group selection lost after dragging: '+name);
      const delta=after.map((item,index)=>({x:item.x-selected[index].x,y:item.y-selected[index].y}));
      invariant(delta.some(point=>Math.hypot(point.x,point.y)>.1),'selected group did not move: '+name+' '+JSON.stringify(delta));
      invariant(delta.every(point=>Math.abs(point.x-delta[0].x)<.02&&Math.abs(point.y-delta[0].y)<.02),'group spacing changed: '+name+' '+JSON.stringify(delta));
      invariant(await evaluate('location.pathname')===currentPath,'group drag followed a card link: '+name);
      await captureScreenshot('canvas-selection-'+name+'.png');
      // Native browser fullscreen may consume physical Escape before the page receives it.
      // Exercise the application's selection key on the canvas, then its native exit below.
      await evaluate(`document.querySelector(${JSON.stringify(root)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))`);await settleFrames();
      invariant(await evaluate(`!document.querySelector(${JSON.stringify(root+' [data-canvas-selected]')})&&document.querySelector(${JSON.stringify(shell)})?.classList.contains('is-fullscreen')`),'first Escape should clear selection before exiting fullscreen: '+name+' '+JSON.stringify(await evaluate(`({selected:document.querySelectorAll('[data-canvas-selected]').length,fullscreen:document.fullscreenElement?.className,active:document.activeElement?.outerHTML.slice(0,200),shell:document.querySelector(${JSON.stringify(shell)})?.className})`)));
      await pressKey('Escape','Escape',27);await settleFrames();
      invariant(await evaluate(`!document.querySelector(${JSON.stringify(shell)})?.classList.contains('is-fullscreen')`),'second Escape should exit fullscreen: '+name);
    }
    invariant(cdp.runtimeExceptions.length===0,`Selection browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS canvas-selection: real term-card rectangle, additive/keyboard selection, group drag with stable spacing on all four fullscreen canvases, no accidental links, Escape selection/fullscreen ordering; no layout writes');
  }finally{await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;}
}

async function canvasControlsFlow() {
  const cases=[
    ['organizations','/','kassandra.valdata','.organization-explorer','.org-stage'],
    ['models','/models/83cb48b4-32b4-5bc9-b613-1036c3cb2e77/mappings','christian.man','.mapping-shell','.mapping-graph'],
    ['domains','/domains/network','kassandra.valdata','.domain-network','.graph-node'],
    ['terms','/domains/terminology?view=network','kassandra.valdata','.network-editor','.layout-actions'],
  ];
  for(const width of [1440,390])for(const [name,route,actor,selector,ready] of cases){
    await navigate(route,actor,width,1000);
    if(name==='models'){
      await waitFor("document.querySelector('.mapping-toolbar nav button')",'model toolbar did not load');
      // The Mapping workspace intentionally starts in its accessible table on
      // narrow screens. Explicitly select the canvas before testing its controls.
      await clickText('.mapping-toolbar nav button','Graph');
    }
    await waitFor(`document.querySelector(${JSON.stringify(selector+' '+ready)})&&document.querySelector(${JSON.stringify(selector+' .canvas-fullscreen-toggle')})`,'canvas controls missing: '+name);
    const sizes=await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(selector)});return [...root.querySelectorAll('.daca-canvas-actions .daca-button')].map(button=>({text:button.textContent.trim(),height:button.getBoundingClientRect().height,font:getComputedStyle(button).fontSize}));})()`);
    invariant(sizes.length&&sizes.every(button=>button.height>=31&&button.height<=45),'inconsistent compact canvas buttons: '+name+' '+JSON.stringify(sizes));
    const overflow=await evaluate('document.body.style.overflow');
    await capturePageSegmentScreenshot(selector,`canvas-controls-${name}-${width}.png`,width,1000);
    await evaluate(`document.querySelector(${JSON.stringify(selector+' .canvas-fullscreen-toggle')}).click()`);
    await waitFor(`document.querySelector(${JSON.stringify(selector)})?.classList.contains('is-fullscreen')`,'fullscreen failed: '+name);
    await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(selector)});root.scrollTop=root.scrollHeight;})()`);await settleFrames();
    invariant(await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(selector+' .canvas-fullscreen-toggle')}),r=button.getBoundingClientRect();return button.textContent.includes('Vollbild verlassen')&&getComputedStyle(button).position==='fixed'&&r.top>=0&&r.top<80&&r.right<=innerWidth&&r.left>=0;})()`),'fullscreen exit is unreachable after scrolling: '+name);
    await captureScreenshot(`canvas-fullscreen-${name}-${width}.png`);
    await pressKey('Escape','Escape',27);
    await waitFor(`!document.querySelector(${JSON.stringify(selector)})?.classList.contains('is-fullscreen')&&document.body.style.overflow===${JSON.stringify(overflow)}`,'Escape left fullscreen or page scrolling locked: '+name);
    await evaluate(`document.querySelector(${JSON.stringify(selector+' .canvas-fullscreen-toggle')}).click()`);
    await waitFor(`document.querySelector(${JSON.stringify(selector)})?.classList.contains('is-fullscreen')`,'second fullscreen entry failed: '+name);
    await evaluate(`document.querySelector(${JSON.stringify(selector+' .canvas-fullscreen-toggle')}).click()`);
    await waitFor(`!document.querySelector(${JSON.stringify(selector)})?.classList.contains('is-fullscreen')&&document.body.style.overflow===${JSON.stringify(overflow)}`,'fullscreen close button failed: '+name);
    invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'canvas header overflows page: '+name+' '+width);
  }
  invariant(cdp.runtimeExceptions.length===0,`Canvas control errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS canvas-controls: compact headers across organizations/models/domains/terms, visible exit after scrolling, Escape and button exit, desktop/mobile and restored page scrolling');
}

async function domainRadialLayoutFlow() {
  const actor='kassandra.valdata',path='/api/v1/domain-network/view';
  await navigate('/',actor);
  const baseline=expectStatus(await api(actor,path),200,'read radial view baseline').body;
  const shared=expectStatus(await api(actor,'/api/v1/semantic-graphs/domains'),200,'read shared radial baseline').body;
  try {
    const prepared=expectStatus(await api(actor,path,{method:'PUT',body:{revision:baseline.revision,configuration:{schemaVersion:1,positions:{},addedDomainIds:[],hiddenDomainIds:[],visibleKinds:['product']}}}),200,'set radial test view').body;
    for(const [width,height] of [[1440,1100],[3840,2160],[390,850]]) {
      await navigate('/domains/network',actor,width,height);
      await waitFor("document.querySelectorAll('.domain-network .graph-node').length>=3&&document.querySelectorAll('.domain-asset').length>0",'radial domain fixtures missing');
      if(width===3840)await evaluate("document.querySelector('.domain-network .canvas-tools button[aria-label=\"Vollbild öffnen\"]').click()");
      invariant(await evaluate("document.querySelectorAll('.domain-network [role=switch]').length===6&&!document.querySelector('.domain-network input[type=checkbox]')"),'canvas controls must use the existing toggles');
      invariant(await evaluate("(()=>{const layers=document.querySelector('.object-layers').getBoundingClientRect(),toolbar=document.querySelector('.network-canvas-toolbar').getBoundingClientRect();return toolbar.top-layers.bottom<=2&&[...document.querySelectorAll('.object-layers label')].every(label=>label.getBoundingClientRect().height>=44);})()"),'object toggles and filter/zoom row must be compact without reducing toggle targets');
      if(width>=1440)invariant(await evaluate("(()=>{const own=document.querySelector('.network-filters .office-filter label').getBoundingClientRect(),retired=document.querySelector('.network-retired-toggle').getBoundingClientRect(),zoom=document.querySelector('.domain-network .graph-controls').getBoundingClientRect();return own.left<retired.left&&retired.right<=zoom.left&&Math.abs((own.top+own.bottom-retired.top-retired.bottom)/2)<4&&Math.abs((zoom.top+zoom.bottom-retired.top-retired.bottom)/2)<4;})()"),'canvas filters and zoom are not aligned in the requested order');
      if(width===390)invariant(await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&[...document.querySelectorAll('.network-canvas-toolbar button,.object-layers button')].every(button=>button.getBoundingClientRect().right<=innerWidth)"),'canvas toggles overflow on mobile');
      await evaluate("document.querySelector('.network-retired-toggle [role=switch]').focus()");
      await pressKey(' ','Space',32);
      await waitFor("document.querySelector('.network-retired-toggle [role=switch]').getAttribute('aria-checked')==='true'",'retired toggle is not keyboard-operable');
      await pressKey(' ','Space',32);
      await waitFor("document.querySelector('.network-retired-toggle [role=switch]').getAttribute('aria-checked')==='false'",'retired toggle did not turn off');
      await evaluate("(()=>{const minus=document.querySelector('.domain-network .graph-controls button[aria-label=\"Domänennetz verkleinern\"]');minus.click();minus.click();})()");
      await clickText('.domain-network .draft-actions button','Automatisch anordnen');
      if(width>=1440)invariant(await evaluate("parseInt(document.querySelector('.domain-network .graph-controls>span').textContent)>40"),'auto-arrange retained a previous tiny zoom despite available space');
      await waitFor("(()=>{const viewport=document.querySelector('.domain-network .semantic-graph'),cards=[...document.querySelectorAll('.domain-network .graph-node,.domain-network .domain-asset')].map(node=>node.getBoundingClientRect()),xs=cards.map(card=>card.x),ys=cards.map(card=>card.y);if(!cards.length||new Set(xs.map(Math.round)).size<3||new Set(ys.map(Math.round)).size<3)return false;const left=Math.min(...cards.map(card=>card.left)),right=Math.max(...cards.map(card=>card.right)),top=Math.min(...cards.map(card=>card.top)),bottom=Math.max(...cards.map(card=>card.bottom)),box=viewport.getBoundingClientRect();return Math.abs((left+right)/2-(box.left+viewport.clientLeft+viewport.clientWidth/2))<4&&Math.abs((top+bottom)/2-(box.top+viewport.clientTop+viewport.clientHeight/2))<4;})()",'automatic network is not centered in its actual viewport');
      invariant(await evaluate("(()=>{const cards=[...document.querySelectorAll('.domain-network .graph-node,.domain-network .domain-asset')].map(node=>node.getBoundingClientRect());return cards.every((a,i)=>cards.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));})()"),'radial cards overlap');
      await capturePageSegmentScreenshot('.domain-network',`domain-radial-${width}.png`,width,height);
      invariant(JSON.stringify(expectStatus(await api(actor,path),200,'verify radial draft').body)===JSON.stringify(prepared),'automatic arrangement saved unexpectedly');
      await clickText('.domain-network .draft-actions button','Entwurf verwerfen');
    }
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/semantic-graphs/domains'),200,'verify radial shared graph').body)===JSON.stringify(shared),'radial arrangement changed shared links');
    invariant(cdp.runtimeExceptions.length===0,`Radial layout errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS domain-radial-layout: centered radial clusters, products, no overlap, 1440px, 3840px fullscreen, 390px, draft and shared isolation');
  } finally {
    const current=expectStatus(await api(actor,path),200,'read radial cleanup').body;
    expectStatus(await api(actor,path,{method:'PUT',body:{revision:current.revision,configuration:baseline.configuration}}),200,'restore radial personal view');
  }
}

async function domainExplorationFlow() {
  const actor='marcello.hebeisa',other='matteo.duca',viewPath='/api/v1/domain-network/view',graphPath='/api/v1/semantic-graphs/domains';
  await navigate('/domains?view=network',actor);
  const baseline=expectStatus(await api(actor,viewPath),200,'read private exploration baseline').body;
  const otherBaseline=expectStatus(await api(other,viewPath),200,'read deputy view baseline').body;
  const shared=expectStatus(await api(actor,graphPath),200,'read shared graph baseline').body;
  try {
    expectStatus(await api(actor,viewPath,{method:'PUT',body:{revision:baseline.revision,configuration:{schemaVersion:1,addedDomainIds:[],hiddenDomainIds:[],positions:{},visibleKinds:['product']}}}),200,'set deterministic personal view');
    await navigate('/domains?view=network',actor);
    await waitFor("document.querySelectorAll('.domain-network [data-domain-id]').length===2&&document.querySelectorAll('.domain-asset').length===2",'CPS domains and default products did not appear');
    console.log('CHECK domain-exploration default CPS domains/products loaded');
    invariant(await evaluate("[...document.querySelectorAll('.domain-owner')].every(node=>node.textContent.includes('Marcello Hebeisa'))"),'domain Owner not visible');
    invariant(await evaluate("document.querySelectorAll('.object-layers [role=switch][aria-checked=true]').length===1&&document.querySelector('.object-layers [role=switch]').getAttribute('aria-checked')==='true'"),'data products are not the default layer');
    await capturePageSegmentScreenshot('.domain-network','domain-exploration-products.png',1440,1100);
    await evaluate("document.querySelectorAll('.object-layers [role=switch]').forEach(toggle=>{if(toggle.getAttribute('aria-checked')!=='true')toggle.click();})");
    await waitFor("document.querySelectorAll('.domain-asset').length===16",'all four object layers did not appear immediately');
    console.log('CHECK domain-exploration all object layers loaded');
    invariant(await evaluate("document.querySelectorAll('[data-asset-kind=physical]').length===4&&[...document.querySelectorAll('.domain-asset')].every(link=>link.target==='_blank')"),'physical structures or new-tab links missing');
    await evaluate("(()=>{const canvas=document.querySelector('.domain-network .semantic-graph');canvas.scrollIntoView({block:'start',behavior:'instant'});const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.right-220,clientY:r.top+110}));})()");
    await clickText('.domain-context-menu button','Domäne suchen und einfügen');
    await waitFor("document.querySelector('.object-browser-backdrop input')",'existing-domain picker missing');
    await setControls({'.object-browser-backdrop input':'Immobilienmanagement VBS'});
    await waitFor("[...document.querySelectorAll('.object-browser-backdrop .object-result')].some(item=>item.textContent.includes('Immobilienmanagement VBS'))",'foreign department domain unavailable');
    await clickText('.object-browser-backdrop .object-result','Immobilienmanagement VBS');
    await waitFor("document.querySelectorAll('.domain-network .graph-node.is-foreign').length===1",'foreign domain hidden by own-office filter');
    invariant(await evaluate("document.querySelector('.graph-node.is-foreign .foreign-scope').textContent.includes('VBS')&&document.querySelector('.graph-node.is-foreign .foreign-scope').textContent.trim()!=='VBS'"),'foreign domain lacks trusted department/office codes');
    await evaluate("document.querySelector('.graph-node.is-foreign').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:650,clientY:650}))");
    invariant(await evaluate("[...document.querySelectorAll('.domain-context-menu button')].find(item=>item.textContent.includes('Neue Domänenbeziehung')).disabled"),'foreign domain relationship is editable');
    await pressKey('Escape','Escape',27);
    await clickText('.domain-network .draft-actions button','Netz speichern');
    await waitFor("document.querySelector('.domain-network .draft-actions button').disabled&&document.querySelector('.domain-network .draft-actions button').textContent.trim()==='Netz speichern'",'private view did not save');
    const saved=expectStatus(await api(actor,viewPath),200,'read saved private view').body;
    invariant(saved.configuration.visibleKinds.length===4&&saved.configuration.addedDomainIds.length===1,'private additions/layers missing');
    invariant(JSON.stringify(expectStatus(await api(other,viewPath),200,'verify private isolation').body)===JSON.stringify(otherBaseline),'deputy private view changed');
    invariant(JSON.stringify(expectStatus(await api(actor,graphPath),200,'verify shared graph isolation').body)===JSON.stringify(shared),'private exploration changed shared graph');
    await navigate('/domains?view=network',actor);
    await waitFor("document.querySelectorAll('.object-layers [role=switch][aria-checked=true]').length===4&&document.querySelector('.graph-node.is-foreign')&&document.querySelectorAll('[data-asset-kind=physical]').length===4",'private view did not survive reload');
    await capturePageSegmentScreenshot('.domain-network','domain-exploration-all-layers.png',1440,1200);
    invariant(cdp.runtimeExceptions.length===0,`Domain exploration raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS domain-exploration: CPS Owner, default products, all four immediate layers, cross-department picker, gray read-only domain, private PG persistence, shared/deputy isolation and native new-tab links');
  } finally {
    const current=expectStatus(await api(actor,viewPath),200,'read private view cleanup').body;
    expectStatus(await api(actor,viewPath,{method:'PUT',body:{revision:current.revision,configuration:baseline.configuration}}),200,'restore only test personal view');
  }
}

async function domainNetworkFlow() {
  await navigate('/domains?view=cards','sibilla.micheli');
  const path='/api/v1/semantic-graphs/domains',baseline=expectStatus(await api('sibilla.micheli',path),200,'read domain graph baseline').body;
  const viewPath='/api/v1/domain-network/view',personalBaseline=expectStatus(await api('sibilla.micheli',viewPath),200,'read personal layout baseline').body;
  const domains=[],suffix=Date.now();let lastWritten=null;
  try {
    for(const label of ['Teilbereich','Gesamtbereich'])domains.push(await createApprovedTestDomain('sibilla.micheli',{ownerUserId:'sibilla.micheli',deputyOwnerUserId:'sandro.wenger',localizations:[{language:'de',preferredLabel:`Netz QA ${label} ${suffix}`,definition:'Synthetische UI-Testdomäne.'}]}));
    const [source,target]=domains;
    await navigate('/domains/network?ownOffice=0','sibilla.micheli');
    await waitFor(`document.querySelector('[data-domain-id="${source.id}"]')!==null&&!document.querySelector('.domain-network daca-loading-indicator')`,'domain network cards/objects did not finish loading');
    await settleFrames();
    const before=await evaluate(`(() => {const card=document.querySelector('[data-domain-id="${source.id}"]');return{x:parseFloat(card.style.left),y:parseFloat(card.style.top)};})()`);
    await evaluate(`document.querySelector('[data-domain-id="${source.id}"] header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))`);
    invariant(expectStatus(await api('sibilla.micheli',path),200,'read locally moved domain graph').body.revision===baseline.revision,'domain move saved automatically');
    await clickText('.domain-network .draft-actions button','Entwurf verwerfen');
    await waitFor(`(()=>{const style=document.querySelector('[data-domain-id="${source.id}"]').style;return Math.abs(parseFloat(style.left)-${before.x})<.02&&Math.abs(parseFloat(style.top)-${before.y})<.02;})()`,'discard did not restore the shared layout');
    await evaluate(`document.querySelector('[data-domain-id="${source.id}"] header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))`);
    await clickText('.domain-network .draft-actions button','Netz speichern');
    await waitFor("document.querySelector('.domain-network [role=status]')?.textContent.includes('Ansicht gespeichert')",'domain layout did not save');
    const personalSaved=expectStatus(await api('sibilla.micheli',viewPath),200,'read saved personal positions').body;
    const savedY=personalSaved.configuration.positions[`domain:${source.id}`].y;
    // Radial placement has subpixel coordinates; CSS serialization rounds them.
    invariant(Math.abs(savedY-(before.y+10))<.02,'domain position differs from private draft: '+JSON.stringify({before:before.y,expected:before.y+10,saved:savedY}));
    const other=expectStatus(await api('christian.man',path),200,'read domain graph as another person').body;
    invariant(JSON.stringify(other.positions)===JSON.stringify(baseline.positions),'private layout leaked to another user');
    invariant(await evaluate(`!document.querySelector('[data-domain-id="${source.id}"] .ontology-port')`),'unconnected domain retained a connection port');
    await evaluate(`document.querySelector('[data-domain-id="${source.id}"] header').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}))`);
    await clickText('.domain-network .concept-context-menu button','Neue Domänenbeziehung');
    await evaluate(`document.querySelector('[data-domain-id="${target.id}"]').click()`);
    await waitFor("document.querySelector('.domain-network .relation-dialog')!==null",'domain ports did not offer a relationship');
    await evaluate("(() => {const type=document.querySelectorAll('.domain-network .relation-dialog select')[1];type.value='partOf';type.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await clickText('.domain-network .relation-dialog button','Entwurf übernehmen');
    invariant(!expectStatus(await api('sibilla.micheli',path),200,'check unsaved domain link').body.relations.some(link=>link.sourceId===source.id),'domain link saved before Netz speichern');
    await clickText('.domain-network .draft-actions button','Netz speichern');
    await waitFor("document.querySelector('.domain-network .draft-actions button')?.disabled&&document.querySelector('.domain-network .draft-actions button')?.textContent.trim()==='Netz speichern'",'domain link did not finish saving');
    lastWritten=expectStatus(await api('sibilla.micheli',path),200,'read saved domain relation').body;
    invariant(lastWritten.relations.some(link=>link.sourceId===source.id&&link.targetId===target.id&&link.relationType==='partOf'),'domain relation is not persisted');
    await evaluate(`document.querySelector('[data-domain-id="${source.id}"]').scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
    await captureScreenshot('shared-domain-network.png');
    await navigate('/domains?view=network&ownOffice=0','christian.man');await waitFor(`document.querySelector('[data-domain-id="${source.id}"]')!==null`,'shared graph did not reload');
    await evaluate(`document.querySelector('[data-domain-id="${source.id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:300}))`);
    await waitFor("document.querySelector('.domain-network .concept-context-menu')!==null",'domain context menu missing');
    invariant(await evaluate("[...document.querySelectorAll('.domain-network .concept-context-menu [role=menuitem]')].filter(button=>button.textContent.includes('suchen und öffnen')).length===4"),'domain context lacks one of the four object searches');
    await clickText('.domain-network .concept-context-menu button','Logisches Modell suchen und öffnen');
    await waitFor("document.querySelector('.object-browser-backdrop input')!==null",'catalog search modal missing');
    for(const label of ['Terme','Logische Modelle','Physische Modelle']){
      await clickText('.object-browser-backdrop nav button',label);
      await waitFor("document.querySelectorAll('.object-browser-backdrop .object-result').length>0&&!document.querySelector('.object-browser-backdrop [role=alert]')",`${label} are not accessible through the common search`);
    }
    await captureScreenshot('catalog-object-search.png');
    await clickText('.object-browser-backdrop nav button','Domänen');
    await waitFor("document.querySelectorAll('.object-browser-backdrop .object-result').length>0",'domain search results missing');
    await evaluate(`(() => {const input=document.querySelector('.object-browser-backdrop input');input.value=${JSON.stringify(target.preferredLabel)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const newTargets=new Set((await cdp.call('Target.getTargets')).targetInfos.map(target=>target.targetId));
    await controlClick('.object-browser-backdrop .object-result',target.preferredLabel);
    let opened;const until=Date.now()+8000;
    while(!opened&&Date.now()<until){opened=(await cdp.call('Target.getTargets')).targetInfos.find(tab=>!newTargets.has(tab.targetId)&&new URL(tab.url||'about:blank').pathname===`/domains/${target.id}`);if(!opened)await sleep(100);}
    invariant(opened,'general search did not open its domain result in a new tab');await cdp.call('Target.closeTarget',{targetId:opened.targetId});
    await navigate(`/domains/${target.id}`,'christian.man');
    await evaluate("document.querySelector('.network-editor .semantic-graph').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:350,clientY:300}))");
    await clickText('.concept-context-menu button','Domäne suchen und öffnen');
    await waitFor("document.querySelectorAll('.object-browser-backdrop .object-result').length>0",'domain-to-domain navigation search missing');
    await evaluate(`(() => {const input=document.querySelector('.object-browser-backdrop input');input.value=${JSON.stringify(source.preferredLabel)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickText('.object-browser-backdrop .object-result',source.preferredLabel);
    await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(source.preferredLabel)}`,'same-route domain navigation retained the previous domain');
    console.log('PASS semantic networks: private layouts, shared relations, local drafts, discard, hierarchy, four object searches and domain-to-domain navigation');
  } finally {
    const personalCurrent=expectStatus(await api('sibilla.micheli',viewPath),200,'read private layout cleanup').body;expectStatus(await api('sibilla.micheli',viewPath,{method:'PUT',body:{revision:personalCurrent.revision,configuration:personalBaseline.configuration}}),200,'restore test personal layout');
    if(lastWritten){
      const current=expectStatus(await api('sibilla.micheli',path),200,'read graph for isolated fixture cleanup').body,positions={...current.positions},owned=new Set(domains.map(domain=>domain.id));
      for(const [key,value] of Object.entries(lastWritten.positions))if(JSON.stringify(current.positions[key])===JSON.stringify(value)){if(key in baseline.positions)positions[key]=baseline.positions[key];else delete positions[key];}
      for(const id of owned)delete positions[`domain:${id}`];
      const relations=current.relations.filter(link=>!owned.has(link.sourceId)&&!owned.has(link.targetId));
      expectStatus(await api('sibilla.micheli',path,{method:'PUT',body:{revision:current.revision,positions,relations}}),200,'remove only this run domain graph fixtures');
    }
    for(const domain of domains)expectStatus(await api('sibilla.micheli',`/api/v1/domains/${domain.id}/retire`,{method:'POST',etag:`"${domain.revision}"`,body:{}}),200,'retire only synthetic network domain');
  }
}

async function conceptNetworkEditingFlow() {
  await navigate('/domains?view=cards','christian.man');
  const suffix=Date.now();
  const domain={body:await createApprovedTestDomain('sibilla.micheli',{ownerUserId:'sibilla.micheli',deputyOwnerUserId:'sandro.wenger',localizations:[{language:'de',preferredLabel:`Begriffsnetz QA ${suffix}`,definition:'Isolierte synthetische Testdomäne für den Begriffsnetz-Editor.'}]})};
  const approve=async(proposal)=>{let result=proposal;for(const review of proposal.reviews)result=expectStatus(await api(review.ownerUserId,`/api/v1/glossary/term-proposals/${proposal.id}/reviews/${review.domainId}/decision`,{method:'POST',etag:`"${proposal.revision}"`,body:{decision:'approve',comment:'Synthetische Editorprüfung.'}}),200,'approve synthetic concept change').body;return result;};
  const create=async(label,relations=[])=>{const proposal=expectStatus(await api('christian.man','/api/v1/glossary/term-proposals',{method:'POST',body:{operation:'create',payload:{domainIds:[domain.body.id],localizations:[{language:'de',preferredLabel:label,definition:`Synthetischer Begriff ${label}.`}],relations}}}),201,'create synthetic concept proposal').body;return(await approve(proposal)).targetTermId;};
  try {
    const b=await create('Person'),a=await create('Mitarbeitende',[{relation:'broader',targetTermId:b}]),c=await create('Anstellung');
    const route=`/domains/${domain.body.id}`;
    await navigate(route,'christian.man');await waitFor("document.querySelectorAll('.network-editor .is-term').length===3&&document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'editable concept cards missing');
    await evaluate("document.querySelector('.network-editor').requestFullscreen=undefined;document.querySelector('.network-editor .fullscreen-toggle').click()");
    await waitFor("document.querySelector('.network-editor.is-fullscreen')!==null",'concept editor fullscreen missing');
    const bounds=async(selector)=>evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+15,left:r.left,top:r.top};})()`);
    const aHeader=`[data-term-id="${a}"] header`;
    const before=await bounds(aHeader);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+step*35,y:before.y+step*50,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+140,y:before.y+200,button:'left',buttons:0,clickCount:1},sessionId);
    await settleFrames();
    const moved=await bounds(aHeader);invariant(moved.left>before.left+100&&moved.top>before.top+40,'concept card did not move freely');
    await evaluate(`document.querySelector(${JSON.stringify(aHeader)}).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
    await settleFrames();
    const aPosition=await evaluate(`document.querySelector('[data-term-id="${a}"]').style.cssText`);
    const conceptGraphPath=`/api/v1/semantic-graphs/concepts/${domain.body.id}`;
    invariant(expectStatus(await api('christian.man',conceptGraphPath),200,'read unsaved term layout').body.revision===0,'term drag saved without Layout speichern');
    await clickText('.network-editor .layout-actions button','Layout speichern');
    await waitFor("document.querySelector('.network-editor .layout-actions button')?.disabled&&document.querySelector('.network-editor [role=status]')?.textContent.includes('Layout für alle gespeichert')",'term layout did not save');
    const sharedConcept=expectStatus(await api('sibilla.micheli',conceptGraphPath),200,'read shared term layout as another person').body;
    invariant(sharedConcept.revision===1&&sharedConcept.positions[`term:${a}`],'saved term layout is not shared across identities');
    const relation=()=>evaluate("[...document.querySelectorAll('.graph-relationship')].find(edge=>edge.dataset.edgeId.startsWith('relation:')).dataset.edgeId");
    let edgeId=await relation();
    const edgePoint=async()=>evaluate(`(() => {const p=document.querySelector('[data-edge-id="${edgeId}"] .edge-hit');for(const f of [.5,.3,.7]){const v=p.getPointAtLength(p.getTotalLength()*f),s=new DOMPoint(v.x,v.y).matrixTransform(p.getScreenCTM());if(document.elementFromPoint(s.x,s.y)?.closest('.graph-relationship'))return{x:s.x,y:s.y};}throw new Error('No reachable concept relationship point');})()`);
    await captureScreenshot('concept-before-edge.png');
    let point=await edgePoint();await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point},sessionId);
    await waitFor(`parseFloat(getComputedStyle(document.querySelector('[data-edge-id="${edgeId}"] .graph-edge')).strokeWidth)>2`,'concept edge hover missing');
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',buttons:2,clickCount:1},sessionId);await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',buttons:0,clickCount:1},sessionId);
    await waitFor("document.querySelector('.edge-actions-menu')!==null",'relationship context menu missing');
    await clickText('.edge-actions-menu button','Verbindungstyp ändern');
    await waitFor("document.querySelector('.relation-dialog')!==null",'relationship type editor missing');
    await evaluate("(() => {const select=document.querySelectorAll('.relation-dialog select')[1];select.value='related';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await captureScreenshot('concept-relationship-context-1440x900.png');await clickText('.relation-dialog button','Entwurf übernehmen');
    await waitFor("document.querySelector('.relation-dialog')===null&&document.querySelectorAll('.edge-handles circle').length===2",'relationship edit did not expose draggable ends');
    await settleFrames();
    const positions=await evaluate(`(() => {const from=document.querySelector('[data-edge-handle="target"]').getBoundingClientRect(),to=document.querySelector('[data-term-id="${c}"]').getBoundingClientRect();return{from:{x:from.left+from.width/2,y:from.top+from.height/2},to:{x:to.left+to.width/2,y:to.top+to.height/2}};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...positions.from,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:positions.from.x+(positions.to.x-positions.from.x)*step/4,y:positions.from.y+(positions.to.y-positions.from.y)*step/4,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...positions.to,button:'left',buttons:0,clickCount:1},sessionId);
    try{await waitFor(`document.querySelector('[data-edge-id="${edgeId}"]')?.getAttribute('data-target-id')==='term:${c}'`,'rewired edge did not render its new target');}catch(error){await captureScreenshot('concept-drop-failure.png');throw new Error(error.message+' '+JSON.stringify(await evaluate(`({notice:document.querySelector('.network-editor [role=status]')?.textContent,alerts:[...document.querySelectorAll('[role=alert]')].map(item=>item.textContent),edges:[...document.querySelectorAll('.graph-relationship')].map(item=>({id:item.dataset.edgeId,target:item.dataset.targetId}))})`)));}
    await evaluate(`document.querySelector('[data-edge-id="${edgeId}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
    await clickText('.edge-actions-menu button','Verbindungstyp ändern');
    try{await waitFor(`document.querySelectorAll('.relation-dialog select')[2]?.value==='${c}'`,'dragging the concept endpoint did not rewire its target');}catch(error){await captureScreenshot('concept-rewire-failure.png');throw new Error(error.message+' '+JSON.stringify(await evaluate(`({from:${JSON.stringify(positions.from)},to:${JSON.stringify(positions.to)},notice:document.querySelector('.network-editor [role=status]')?.textContent,expected:${JSON.stringify({a,b,c})},selects:[...document.querySelectorAll('.relation-dialog select')].map(item=>item.value),alerts:[...document.querySelectorAll('[role=alert]')].map(item=>item.textContent),target:document.elementsFromPoint(${positions.to.x},${positions.to.y}).map(item=>item.tagName+'.'+item.classList).slice(0,8)})`)));}
    await clickText('.relation-dialog button','Beziehung löschen');await waitFor("[...document.querySelectorAll('.graph-relationship')].every(edge=>!edge.dataset.edgeId.startsWith('relation:'))",'concept relationship deletion did not create a local draft');
    await evaluate("document.querySelector('.network-editor .fullscreen-toggle').click()");
    const reload=cdp.call('Page.reload',{ignoreCache:true},sessionId);await sleep(250);try{await cdp.call('Page.handleJavaScriptDialog',{accept:true},sessionId);}catch{}await reload;
    await waitFor("document.querySelector('.network-editor')?.innerText.includes('Lokaler Entwurf wiederhergestellt')&&document.querySelector('.network-editor')?.getAttribute('aria-busy')==='false'",'concept draft did not survive reload');
    invariant(await evaluate(`document.querySelector('[data-term-id="${a}"]').style.cssText===${JSON.stringify(aPosition)}`),'concept arrangement did not survive reload');
    await evaluate(`document.querySelector('[data-term-id="${a}"] header').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}))`);
    await waitFor("document.querySelector('.concept-context-menu')!==null",'concept keyboard context menu missing');await clickText('.concept-context-menu button','Neue Beziehung');
    await evaluate(`document.querySelector('[data-term-id="${c}"]').click()`);await waitFor("document.querySelector('.relation-dialog')!==null",'keyboard connection did not start a new relation');await clickText('.relation-dialog button','Abbrechen');
    await evaluate("document.querySelector('.network-editor').requestFullscreen=undefined;document.querySelector('.network-editor .fullscreen-toggle').click()");await settleFrames();
    invariant(await evaluate(`!document.querySelector('[data-term-id="${a}"] .ontology-port.is-right')`),'unconnected concept side retained a connection port');
    const portDrag=await evaluate(`(() => {const from=document.querySelector('[data-term-id="${a}"] p').getBoundingClientRect(),to=document.querySelector('[data-term-id="${c}"]').getBoundingClientRect();return{from:{x:from.left+from.width/2,y:from.top+from.height/2},to:{x:to.left+to.width/2,y:to.top+to.height/2}};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...portDrag.from,button:'left',buttons:1,clickCount:1},sessionId);
    await waitFor("document.querySelector('.network-editor .hold-line')!==null",'holding an unconnected concept did not expose the connection preview');
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
  const reference = expectStatus(
    await api('cinthya.thor', '/api/v1/logical-models/be6eb7a4-6bf3-5387-8aaa-86c01a46290b'),
    200, 'read existing organization model reference',
  ).body;
  const stamp=Date.now();
  // Create the existing logical side before mapping, without accumulating links on a shared seed model.
  const logicalModel=expectStatus(await api('christian.man','/api/v1/logical-models',{method:'POST',body:{
    identifiers:[`EDGE-EXISTING-${stamp}`],localizations:[{language:'de',title:`Existing mapping QA ${stamp}`,description:'Isolated existing-to-existing mapping regression.'}],
    dataOwnerUserId:reference.dataOwnerUserId,deputyOwnerUserId:reference.deputyOwnerUserId,
    creator:{type:'Application',applicationName:'Existing mapping QA'},dataDomainId:null,
    organizationUnitId:reference.organizationId,dataClassification:'internal',dateCreated:new Date().toISOString().slice(0,10),
    contactPoints:[{name:'Mapping QA',email:'mapping@example.test'}],publisher:reference.publisher,
    accessRights:'urn:daca:access-rights:internal',entities:[{name:'organization_unit',businessObject:'Organisationseinheit',fields:[{
      name:'code',position:0,dataType:'string',shortDescription:'Synthetic organization code.',classification:'internal',nullable:false,minCount:1,maxCount:1,
    }]}],
  }}),201,'create isolated existing logical model').body;
  const organizationModelId=logicalModel.id;
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
    const button = card?.querySelector('.source-actions-trigger');
    return Boolean(button) && !button.disabled;
  })()`, 'drift source did not become ready for a follow-up import');
  await openSourceCardMenu(physical.sourceId);
  const driftImportStarted = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(physical.sourceName)}));
    const button = [...(card?.querySelectorAll('.source-actions-menu button') ?? [])]
      .find((item) => item.textContent.includes('Neu importieren'));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  invariant(driftImportStarted, 'drift import action was unavailable');
  await waitFor("document.querySelector('.daca-alert.is-success')?.textContent.includes('wurde importiert')", 'fixture drift import did not report completion', 65000);
  const snapshots = expectStatus(
    await api('christian.man', `/api/v1/physical-snapshots?sourceId=${physical.sourceId}`),
    200,
    'list snapshots after confirmed drift import',
  ).body.items;
  invariant(snapshots.some((snapshot) => snapshot.sequence > snapshotSequenceBeforeDrift), 'fixture drift import did not append its immutable snapshot');
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
    await waitFor(`(() => [...document.querySelectorAll('.mapping-shell button')]
      .filter((element) => element.getClientRects().length > 0)
      .every((element) => element.getBoundingClientRect().height >= 40))()`, 'mobile interactive targets remained too small');
  } catch (error) {
    const targets = await evaluate(`(() => [...document.querySelectorAll('.mapping-shell button')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ label: element.textContent.trim().slice(0, 80), height: element.getBoundingClientRect().height }))
      .filter((element) => element.height < 40))()`);
    throw new Error(`${error.message}: ${JSON.stringify(targets)}`);
  }
  const mobile = await evaluate(`(() => {
    const region = document.querySelector('.matrix-region');
    const targets = [...document.querySelectorAll('.mapping-shell button')]
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

async function sourceAccessReturnFlow() {
  const actor = 'christian.man';
  const owner = 'daniel.wenger';
  const sourceId = 'adf4a86e-7ab3-5035-b2cc-c8c907e79468';
  const sourcePath = `/api/v1/physical-sources/${sourceId}`;
  await navigate('/physical-models', actor);
  const source = expectStatus(await api(actor, '/api/v1/physical-sources'), 200, 'source before return').body.items.find(item => item.id === sourceId);
  invariant(source?.canRelinquishAccess, 'VIBDBU must support personal access return');
  const cardExpression = `document.querySelector('.source-card[data-source-id="${sourceId}"]')`;
  await openSourceCardMenu(sourceId);
  await waitFor(`${cardExpression}?.querySelectorAll('[role=menuitem]').length === 3`, 'source actions menu must contain three options');
  await capturePageSegmentScreenshot(`[data-source-id="${sourceId}"]`, 'source-actions-menu.png', 1440, 650);
  await evaluate(`${cardExpression}.querySelectorAll('[role=menuitem]')[2].click()`);
  await waitFor("document.querySelector('dialog[open]') !== null", 'return confirmation did not open');
  await clickText('dialog[open] button', 'Abbrechen');
  invariant(expectStatus(await api(actor, '/api/v1/physical-sources'), 200, 'cancelled return').body.items.some(item => item.id === sourceId), 'cancel changed source access');
  let requestId;
  try {
    await navigate(`/physical-models/${sourceId}`, actor);
    await waitFor("document.querySelector('.object-tree') !== null", 'source structure did not load');
    await evaluate("document.querySelector('.return-access').click()");
    await clickText('dialog[open] button', 'Berechtigungen zurückgeben');
    await waitFor("location.pathname === '/physical-models' && document.querySelector('.returned-sources article') !== null", 'return did not navigate to returned sources');
    invariant(!(await evaluate(`${cardExpression} !== null`)), 'returned source still has an active source card');
    expectStatus(await api(actor, `/api/v1/physical-snapshots/${source.latestSnapshotId}`), 403, 'direct snapshot after return');
    invariant(expectStatus(await api('christian.spider', '/api/v1/physical-sources'), 200, 'other person source access').body.items.some(item => item.id === sourceId), 'return affected another person');
    await navigate('/physical-models', actor);
    await waitFor("document.querySelector('.returned-sources textarea') !== null", 'return did not survive reload');
    await evaluate(`(() => {const field=document.querySelector('.returned-sources textarea');field.value='QA: physical metadata needed for building model';field.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await waitFor("!document.querySelector('.returned-sources button').disabled", 'request reason was not accepted');
    await evaluate("document.querySelector('.returned-sources button').click()");
    await waitFor("document.querySelector('.returned-sources')?.innerText.includes('Freigabe ausstehend')", 'restoration request not pending');
    requestId = expectStatus(await api(actor, '/api/v1/physical-source-access/mine'), 200, 'pending restoration').body.find(item => item.sourceId === sourceId).request.id;
    await navigate('/tasks', owner);
    await waitFor("document.querySelector('.restoration-inbox article') !== null", 'owner restoration task missing');
    await clickText('.restoration-inbox button', 'Zugriff freigeben');
    await waitFor("document.querySelector('.restoration-inbox article') === null", 'owner decision did not complete');
    await navigate('/physical-models', actor);
    await waitFor(`${cardExpression} !== null`, 'approved source did not reappear');
    expectStatus(await api(actor, `/api/v1/physical-snapshots/${source.latestSnapshotId}`), 200, 'restored snapshot access');
    await captureScreenshot('source-access-restored.png');
    await capturePageSegmentScreenshot('.source-grid', 'source-access-cards.png', 1440, 650);
    console.log('PASS source-access-return: cancellation, personal denial, persisted return, request and owner approval');
  } finally {
    const returned = expectStatus(await api(actor, '/api/v1/physical-source-access/mine'), 200, 'return cleanup').body.find(item => item.sourceId === sourceId);
    if (returned) {
      requestId = returned.request?.status === 'submitted' ? returned.request.id : expectStatus(await api(actor, `${sourcePath}/access/requests`, {method:'POST',body:{reason:'QA cleanup: restore original access'}}), 201, 'cleanup request').body.id;
      expectStatus(await api(owner, `/api/v1/physical-source-access-requests/${requestId}/decision`, {method:'POST',body:{decision:'approve'}}), 200, 'cleanup approval');
    }
  }
}

async function expertSearchFlow(){
  const actor='christian.man';
  await cdp.call('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);
  await navigate('/search?q=VIBDBU',actor);
  await waitFor("document.querySelector('.search-loading')===null&&document.querySelector('[data-search-key^=\"field:\"]')!==null",'expert search did not load physical fields',30000);
  invariant(await evaluate("document.querySelector('[data-search-mode=context]').getAttribute('aria-pressed')==='true'&&!!document.querySelector('.search-sidebar')"),'Context navigation is not the default');
  invariant(await evaluate("(()=>{const h=document.querySelector('.search-heading h1').getBoundingClientRect(),tile=document.querySelector('[data-search-mode=context]').getBoundingClientRect();return tile.left>h.right&&tile.height>=70;})()"),'Mode tiles are not large controls to the right of the heading');
  const initial=await evaluate("({query:document.querySelector('#expert-search-input').value,count:document.querySelector('#expert-search-results-title').textContent})");
  await evaluate("document.querySelector('[data-search-key^=\"field:\"] .search-preview-button').click()");
  await waitFor("document.querySelector('.search-preview')!==null",'Context preview did not open');
  const previewTitle=await evaluate("document.querySelector('#search-preview-title').textContent");
  await capturePageSegmentScreenshot('.catalog-search','expert-context-desktop.png',1440,1024);
  await evaluate("document.querySelector('[data-search-mode=focus]').click()");
  await waitFor("document.querySelector('.search-kind-strip')!==null&&document.querySelector('.search-sidebar')===null",'Focus mode did not replace the context navigator');
  invariant(await evaluate(`document.querySelector('#expert-search-input').value===${JSON.stringify(initial.query)}&&document.querySelector('#expert-search-results-title').textContent===${JSON.stringify(initial.count)}&&document.querySelector('#search-preview-title').textContent===${JSON.stringify(previewTitle)}`),'Mode switch lost the query, results or pinned preview');
  await waitFor("new URL(location.href).searchParams.get('mode')==='focus'",'Focus mode was not saved in the URL');
  await capturePageSegmentScreenshot('.catalog-search','expert-focus-desktop.png',1440,1024);
  await evaluate("document.querySelector('.search-preview>header button:last-child').click()");
  await waitFor("document.querySelector('.search-preview')===null",'Preview did not close');
  await evaluate("document.querySelector('[data-search-key^=\"field:\"] a').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
  await waitFor("document.querySelector('.search-preview')!==null",'Keyboard focus did not reveal the shared preview');
  await evaluate("document.querySelector('.search-preview').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await waitFor("document.querySelector('.search-preview')===null",'Escape did not close preview');
  await evaluate("document.querySelector('[data-search-key^=\"field:\"]').dispatchEvent(new PointerEvent('pointerenter'))");
  await waitFor("document.querySelector('.search-preview')!==null",'Mouse hover did not reveal the shared preview');
  await evaluate("document.querySelector('.search-preview>header button:last-child').click()");
  await evaluate("document.querySelector('.search-filter-button').click()");
  await waitFor("document.querySelector('#search-filter-panel')!==null",'Filter panel did not open');
  await evaluate("(()=>{const select=document.querySelector('#search-filter-panel select');select.value=[...select.options].find(option=>option.value!=='all').value;select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor("new URL(location.href).searchParams.has('organization')",'Organization filter was not retained in the URL');
  await evaluate("document.querySelector('[data-search-mode=context]').click()");
  invariant(await evaluate("document.querySelector('.search-chips')!==null&&document.querySelector('#expert-search-input').value==='VIBDBU'"),'Switching back lost the filters');
  await clickText('.search-chips .search-reset','Filter zurücksetzen');
  await evaluate("document.querySelector('.search-filter-button').click()");
  for(const mode of ['context','focus']){
    await setViewport(390,844);
    await evaluate(`document.querySelector('[data-search-mode=${mode}]').click();document.querySelector('.search-heading').scrollIntoView({behavior:'instant'})`);
    await settleFrames();
    invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${mode} search overflows mobile`);
    await captureScreenshot(`expert-${mode}-mobile.png`);
    await evaluate("document.querySelector('[data-search-key] .search-preview-button').click()");
    await waitFor("document.querySelector('.search-preview')!==null",'Mobile preview did not open');
    invariant(await evaluate("(()=>{const r=document.querySelector('.search-preview').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight;})()"),'Preview leaves the mobile viewport');
    await evaluate("document.querySelector('.search-preview>header button:last-child').click()");
  }
  await setViewport(320,740);
  invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Search overflows a 320px viewport');
  invariant(await evaluate("performance.getEntriesByType('resource').filter(item=>new URL(item.name).pathname==='/api/v1/logical-models').length===1"),'Search repeatedly reloads metadata');
  invariant(cdp.runtimeExceptions.length===0,`Expert search raised browser exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  await evaluate("document.querySelector('.expert-search-control button').click()");
  await waitFor("document.querySelector('#expert-search-input').value===''&&!new URL(location.href).searchParams.has('q')",'Clear search did not reset the URL');
  await navigate('/search?q=vehicle&kind=table',actor);
  await waitFor("document.querySelector('.search-loading')===null&&document.querySelector('[data-search-key^=\"table:\"]')!==null",'Data Structures did not load');
  await setViewport(1440,1024);
  for(const mode of ['context','focus']){
    await evaluate(`document.querySelector('[data-search-mode=${mode}]').click()`);
    await waitFor("document.querySelector('[data-search-kind=structure]')?.getAttribute('aria-pressed')==='true'",'legacy table context did not select Data Structures');
    const label=await evaluate("document.querySelector('[data-search-kind=structure]').textContent");invariant(label.includes('Data Structures'),'search context is still named Tables');
    await evaluate("document.querySelector('.catalog-search').scrollIntoView({behavior:'instant',block:'start'})");await settleFrames();
    await evaluate("document.querySelector('[data-search-kind=structure]').dispatchEvent(new MouseEvent('mouseenter'))");
    await waitFor("[...document.querySelectorAll('[role=tooltip]')].some(item=>item.textContent.includes('S3-Objekte')&&item.textContent.includes('Tabellen'))",'Data Structure tooltip is missing');
    await captureScreenshot(`data-structures-${mode}-tooltip.png`);
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    const icons=await evaluate("[...document.querySelectorAll('.search-row>daca-search-icon span')].map(item=>item.getAttribute('style'))");
    invariant(icons.some(icon=>icon.includes('cube.svg'))&&icons.some(icon=>icon.includes('table.svg')),'S3 object and table results do not retain distinct icons');
    const types=await evaluate("[...document.querySelectorAll('.search-row-kind')].map(item=>item.textContent)");
    invariant(types.some(type=>type.includes('S3-Objekt'))&&types.includes('Tabelle'),'Data Structure results lost their concrete types');
    invariant(await evaluate("new URL(location.href).searchParams.get('kind')==='structure'"),'new links do not use the generic structure context');
  }
  invariant(cdp.runtimeExceptions.length===0,`Search taxonomy raised browser exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS expert-search: default context, heading tiles, state-preserving mode switch, shared pin/focus/Escape preview, filters, mobile and clear');
  console.log('PASS Data Structures: generic filter, legacy URL, table/object types and icons, existing accessible tooltips in both modes');
}

async function mappingStartFlow(){
  const actor='christian.man';
  await cdp.call('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);
  await navigate('/models',actor);
  cdp.deferLogicalReads=true;
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/logical-models',requestStage:'Request'}]},sessionId);
  await evaluate("document.querySelector('a[href=\"/mappings\"]').click()");
  await waitFor("location.pathname==='/mappings'&&!!document.querySelector('.mapping-start-selection')",'mapping start page did not appear');
  await waitFor("!!document.querySelector('.mapping-start-action .small-spinner')&&document.querySelector('.mapping-start-choice:first-child button').disabled",'logical-model spinner was not shown');
  invariant(await evaluate("!document.querySelector('.mapping-start-choice:nth-child(2) button').disabled"),'Slow logical models block the physical entry');
  await capturePageSegmentScreenshot('daca-mapping-start','mapping-start-loading.png',1440,1000);
  cdp.deferLogicalReads=false;
  for(const request of cdp.deferredLogicalReads??[])await cdp.call('Fetch.continueRequest',{requestId:request.requestId},request.sessionId);
  await cdp.call('Fetch.disable',{},sessionId);
  await waitFor("!document.querySelector('.mapping-start-choice button').disabled",'mapping start options did not load');
  invariant(await evaluate("document.querySelectorAll('.mapping-start-choice').length===2&&!document.querySelector('.mapping-shell')&&!document.querySelector('.mapping-start-picker')"),'Entry opens an arbitrary model or an expanded list');
  await capturePageSegmentScreenshot('daca-mapping-start','mapping-start-desktop.png',1440,1000);
  const models=expectStatus(await api(actor,'/api/v1/logical-models'),200,'read models for entry flow').body.items;
  const sources=expectStatus(await api(actor,'/api/v1/physical-sources'),200,'read selectable physical sources').body.items;
  let model,binding,source;
  for(const candidate of models.filter(item=>item.hasPhysicalMapping)){
    const bindings=expectStatus(await api(actor,`/api/v1/logical-models/${candidate.id}/representations`),200,'read existing mapping context').body.items;
    binding=bindings.find(item=>sources.some(source=>source.latestSnapshotId===item.physicalSnapshotId));
    if(binding){model=candidate;source=sources.find(item=>item.latestSnapshotId===binding.physicalSnapshotId);break;}
  }
  invariant(model&&source&&binding,'No existing latest-snapshot mapping context available');
  const snapshot=expectStatus(await api(actor,`/api/v1/physical-snapshots/${binding.physicalSnapshotId}`),200,'read selected snapshot').body;
  const table=snapshot.databases.flatMap(database=>database.schemas.flatMap(schema=>schema.tables)).find(item=>item.id===binding.physicalTableId);
  invariant(table,'Selected physical object is missing');
  await evaluate("document.querySelector('.mapping-start-choice:nth-child(2) button').click()");
  await waitFor("document.querySelector('.representation-dialog[open] .source-options button')!==null",'physical-first picker did not open');
  await waitFor(`document.querySelector('.source-options button[data-source-id=\"${source.id}\"]')&&!document.querySelector('.source-options button[data-source-id=\"${source.id}\"]').disabled`,'Selected physical source is not available');
  await evaluate(`document.querySelector('.source-options button[data-source-id=\"${source.id}\"]').click()`);
  await waitFor("document.querySelector('.object-tree button')!==null",'physical source did not load');
  await evaluate(`(()=>{const button=document.querySelector('.object-tree [data-physical-table-id=\"${table.id}\"]');if(!button)throw new Error('Physical object not listed');button.click();})()`);
  const physicalRoute=`/mappings/physical/${binding.physicalSnapshotId}/${table.id}`;
  await waitFor(`location.pathname===${JSON.stringify(physicalRoute)}&&!!document.querySelector('.mapping-physical-workspace [data-representation-table-id="${table.id}"]')`,'physical selection did not open its canvas immediately');
  invariant(await evaluate("!!document.querySelector('.logical-placeholder')&&!document.querySelector('[data-logical-field-id]')&&!document.querySelector('.mapping-start-action button')"),'Physical entry invented a logical model or requires another confirmation');
  await capturePageSegmentScreenshot('daca-mapping-start','mapping-physical-open.png',1440,1000);
  await navigate(physicalRoute,actor,390,844);
  invariant(await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&getComputedStyle(document.querySelector('.logical-placeholder')).display!=='none'&&!!document.querySelector('.derive-logical')"),'Physical entry overflows mobile or hides counterpart selection');
  invariant(await evaluate("(()=>{const r=document.querySelector('.physical-representation').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()"),'Mobile physical object leaves the viewport');
  await captureScreenshot('mapping-physical-mobile.png');
  await setViewport(1440,900);
  await evaluate("document.querySelector('.logical-placeholder button').click()");
  await setControls({'#mapping-model-query':model.identifiers[0]||model.title});
  await waitFor("document.querySelector('.mapping-start-models button')!==null",'logical model is not searchable');
  await evaluate("document.querySelector('.mapping-start-models button').click()");
  await waitFor(`location.pathname==='/models/${model.id}/mappings'&&!!document.querySelector('[data-representation-id="${table.id}"]')`,'chosen pair did not open in mapping workspace',30000);
  await clickText('.mapping-toolbar nav button','Tabelle');
  await waitFor(`(async()=>{const r=await fetch('/api/v1/me/mapping-workspaces',{headers:{'X-DaCa-User':${JSON.stringify(actor)}}});if(!r.ok)return false;const h=await r.json();return h[0]?.logicalModelId===${JSON.stringify(model.id)}&&h[0]?.physicalTableId===${JSON.stringify(table.id)}&&h[0]?.view==='table';})()`,'workspace context was not persisted');
  await clickText('.mapping-heading a','Andere Modelle auswählen');
  await waitFor("document.querySelector('.mapping-start-recent li')!==null",'recent mapping work did not appear');
  invariant(await evaluate(`document.querySelector('.mapping-start-recent li a').getAttribute('href').startsWith('/models/${model.id}/mappings')`),'most recent work is not listed first');
  await navigate('/mappings',actor);
  await waitFor("document.querySelector('.mapping-start-recent li')!==null",'recent work did not survive a fresh page load');
  await capturePageSegmentScreenshot('daca-mapping-start','mapping-start-recent.png',1440,1000);
  await evaluate("document.querySelector('.mapping-start-recent li .daca-button').click()");
  await waitFor(`location.pathname==='/models/${model.id}/mappings'&&document.querySelector('.mapping-toolbar nav button.is-active')?.textContent.trim()==='Tabelle'`,'resume did not restore mapping view');
  invariant(await evaluate(`new URL(location.href).searchParams.get('physicalTableId')===${JSON.stringify(table.id)}`),'resume lost physical selection');
  await navigate('/mappings',actor,390,844);
  invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'mapping entry overflows mobile');
  await captureScreenshot('mapping-start-mobile.png');
  await setViewport(320,740);invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'mapping entry overflows 320px');
  await navigate('/mappings',actor);
  await evaluate("document.querySelector('.mapping-start-choice:first-child button').click()");
  await setControls({'#mapping-model-query':model.identifiers[0]||model.title});
  await evaluate("document.querySelector('.mapping-start-models button').click()");
  await waitFor(`location.pathname==='/models/${model.id}/mappings'&&!!document.querySelector('.mapping-toolbar')`,'logical selection did not open its workspace immediately');
  invariant(cdp.runtimeExceptions.length===0,`Mapping entry raised browser exceptions: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS mapping-start: loading spinner, immediate logical/physical opening, physical-first canvas, paired mapping, PostgreSQL recents, fresh-load resume, desktop/mobile');
}

async function mappingLiveRefreshFlow(){
  const actor='christian.man';
  await cdp.call('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);
  await navigate('/',actor);
  const models=expectStatus(await api(actor,'/api/v1/logical-models'),200,'read models for mapping refresh').body.items;
  let model;
  for(const candidate of models.filter(item=>item.hasPhysicalMapping)){
    const bindings=expectStatus(await api(actor,`/api/v1/logical-models/${candidate.id}/representations`),200,'read candidate bindings').body.items;
    if(bindings.length){model=candidate;break;}
  }
  invariant(model,'No mapped model is available for the read-only refresh flow');
  const route=`/models/${model.id}/mappings?view=graph`;
  const sameCards="(()=>{const ids=attribute=>[...document.querySelectorAll('['+attribute+']')].map(card=>card.getAttribute(attribute)).sort();return JSON.stringify(ids('data-representation-id'))===JSON.stringify(ids('data-representation-table-id'));})()";
  await navigate(route,actor);
  await waitFor("document.querySelector('.physical-representation')!==null",'mapping graph did not load');
  invariant(await evaluate("[...document.querySelectorAll('.model-tabs a')].find(link=>link.getAttribute('href')?.endsWith('/mappings'))?.textContent.trim()==='Mapping'"),'Mapping tab is not named Mapping');
  invariant(await evaluate(sameCards),'Bindings differ from the graph before hiding');
  const originalCount=await evaluate("document.querySelectorAll('.physical-representation').length");
  const tableId=await evaluate("document.querySelector('.physical-representation').dataset.representationTableId");
  await evaluate("(()=>{const card=document.querySelector('.physical-representation');card.querySelector('header').scrollIntoView({block:'center',behavior:'instant'});const rect=card.querySelector('header').getBoundingClientRect();card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.left+20,clientY:rect.top+20}));})()");
  await waitFor("document.querySelector('.representation-context-menu')!==null",'representation context menu did not open');
  await clickText('.representation-context-menu button','Darstellung dieser Physischen Repräsentation/Deklaration löschen');
  await waitFor(sameCards,'Binding list retained a hidden graph card');
  invariant(await evaluate(`!document.querySelector('[data-representation-id="${tableId}"]')`),'Hidden card is still a binding');
  await clickText('.representation-actions button','Ausgeblendete einblenden');
  await waitFor(`document.querySelectorAll('.physical-representation').length===${originalCount}`,'hidden representation was not restored');
  invariant(await evaluate(sameCards),'Bindings differ from restored graph');
  const connectionLabels=await evaluate("[...document.querySelectorAll('.representation-list .daca-source-connection')].map(item=>item.textContent.trim())");
  invariant(connectionLabels.every(label=>['Mit Quellenanbindung','Nur Strukturmetadaten','Anbindung unbekannt'].includes(label)),'Missing connection labels');
  await capturePageSegmentScreenshot('.representation-panel','mapping-bindings-desktop.png',1440,900);

  // Fulfil only GET reads in this isolated browser. No live catalog records change.
  cdp.mockReadResponses=new Map([
    [`/api/v1/logical-models/${model.id}/representations`,{items:[]}],
    ['/api/v1/asset-mappings',{items:[],total:0}],
    [`/api/v1/logical-models/${model.id}/canvas-layout`,{revision:0,positions:{}}],
  ]);
  await cdp.call('Fetch.enable',{patterns:[
    {urlPattern:`*/api/v1/logical-models/${model.id}/representations`,requestStage:'Request'},
    {urlPattern:'*/api/v1/asset-mappings?*',requestStage:'Request'},
    {urlPattern:`*/api/v1/logical-models/${model.id}/canvas-layout`,requestStage:'Request'},
  ]},sessionId);
  const started=Date.now();
  await waitFor("document.querySelectorAll('.physical-representation').length===0&&document.querySelectorAll('[data-representation-id]').length===0",'automatic refresh did not remove obsolete representations');
  const removalMs=Date.now()-started;
  invariant(removalMs<9000,`Automatic refresh took ${removalMs}ms, more than one polling interval plus request time`);
  invariant(await evaluate("!document.body.innerText.includes('lokales, nicht persistierbares Beispielszenario')"),'Refresh installed fallback data');
  cdp.mockReadResponses.clear();
  await cdp.call('Fetch.disable',{},sessionId);delete cdp.mockReadResponses;
  // Keep the headless page foregrounded and exercise the focus refresh path.
  await cdp.call('Page.bringToFront',{},sessionId);
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor("document.visibilityState==='visible'",'refresh target did not become visible');
  await waitFor(`document.querySelectorAll('.physical-representation').length===${originalCount}`,'representations were not restored by the next refresh');
  invariant(!cdp.interceptionError,cdp.interceptionError);
  invariant(await evaluate(sameCards),'Bindings differ after automatic restoration');
  await setViewport(390,844);
  await evaluate("document.querySelector('.representation-panel').scrollIntoView({behavior:'instant'})");
  await captureScreenshot('mapping-bindings-mobile.png');
  invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Bindings overflow the mobile page');
  invariant(await evaluate("[...document.querySelectorAll('.representation-list .representation-select>strong')].every(label=>{const range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect(),card=label.parentElement.getBoundingClientRect();return text.left>=card.left&&text.right<=card.right+1;})"),'Physical representation names overlap neighbouring cards');
  invariant(await evaluate(sameCards),'Mobile bindings differ from graph');
  console.log(`PASS mapping-live-refresh: shared visibility, restore, connection labels, automatic removal/restoration, mobile; simulated removal detected in ${removalMs}ms`);
}

async function modelDepartmentDefaultFlow() {
  await navigate('/models','christian.spider');
  await waitFor("document.querySelector('.model-filters select')?.value==='VBS'",'Model overview did not default to the signed-in department');
  invariant(await evaluate("[...document.querySelectorAll('.model-row-title>div>span')].every(label=>label.textContent.trim().startsWith('VBS /'))"),'Another department is displayed by default');
  await captureScreenshot('models-own-department-desktop.png');
  await setControls({'.model-filters select':''});
  invariant(await evaluate("document.querySelector('.model-filters select').value===''") ,'All departments cannot be selected explicitly');
  await clickText('.model-filters header button','Filter zurücksetzen');
  await waitFor("document.querySelector('.model-filters select').value==='VBS'",'Reset did not restore the user department');
  await navigate('/models','christian.spider',390,844);
  invariant(await evaluate("document.querySelector('.model-filters select').value==='VBS'&&document.documentElement.scrollWidth<=innerWidth+1"),'Fresh/mobile model overview lost its department default or overflows');
  await evaluate("document.querySelector('.model-filters').scrollIntoView({block:'start',behavior:'instant'})");
  await captureScreenshot('models-own-department-mobile.png');
  invariant(cdp.runtimeExceptions.length===0,`Department filtering raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS model-department-default: own department on entry, filtered rows, explicit All, reset, fresh page and mobile');
}

async function physicalDerivationEntryFlow() {
  for(const type of ['csv','s3']){
    const actor=type==='csv'?'mirjam.keller':'christian.man';
    await navigate('/mappings',actor);
    const sources=expectStatus(await api(actor,'/api/v1/physical-sources'),200,'read derivation origins').body.items;
    const source=type==='csv'?sources.find(item=>item.id==='b7b19a5e-5e5f-50f8-93ac-ab9c92db86eb'):sources.find(item=>item.adapterType==='s3'&&item.latestSnapshotId);
    invariant(source?.latestSnapshotId,`No ${type} origin available`);
    const snapshot=expectStatus(await api(actor,`/api/v1/physical-snapshots/${source.latestSnapshotId}`),200,'read derivation structure').body;
    const tables=snapshot.databases.flatMap(database=>database.schemas.flatMap(schema=>schema.tables));
    const table=type==='csv'?tables.find(item=>item.name==='VIBDBU'):tables.find(item=>item.kind==='parquet'&&item.columns.length>=2);
    invariant(table?.columns.length>=2,`No suitable ${type} data structure`);
    const route=`/mappings/physical/${source.latestSnapshotId}/${table.id}`;
    const before=expectStatus(await api(actor,'/api/v1/logical-models'),200,'models before local derivation').body.items.map(item=>item.id).sort();
    cdp.interceptedTransfers=[];cdp.mockTransferResponse={status:503,body:{detail:'Synthetic save rejection: preserve this local derivation form.'}};
    // Capture the real save payload without creating test models or changing physical sources.
    await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/physical-tables/*/*derive-logical-model',requestStage:'Request'}]},sessionId);
    try {
      await navigate(route,actor,390,844);
      invariant(await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&getComputedStyle(document.querySelector('.logical-placeholder')).display!=='none'&&!!document.querySelector('.derive-logical')"),'Mobile physical entry hides logical choices');
      await captureScreenshot(`derive-${type}-mobile.png`);
      await setViewport(1440,900);await settleFrames();
      await evaluate("(()=>{const canvas=document.querySelector('.graph-canvas'),region=document.querySelector('.graph-scroll');document.querySelector('.mapping-physical-workspace').scrollIntoView({block:'start',behavior:'instant'});region.scrollTop=0;const r=region.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+350,clientY:r.top+100}));})()");
      await waitFor("document.querySelector('.canvas-context-menu')",'Physical canvas menu unavailable');
      const canvasItems=await evaluate("[...document.querySelectorAll('.canvas-context-menu [role=menuitem]')].map(item=>item.textContent.trim())");
      invariant(canvasItems[0]==='Logisches Modell ableiten'&&!canvasItems.some(text=>/^(Term|Domäne) suchen/.test(text)),'Blank canvas offers inappropriate semantic searches or omits derivation');
      await captureScreenshot(`derive-${type}-canvas-menu.png`);
      await clickText('.canvas-context-menu button','Logisches Modell auswählen');
      await waitFor("document.querySelector('#mapping-model-query')",'Logical search did not stay in the physical entry');
      invariant(await evaluate(`location.pathname===${JSON.stringify(route)}`),'Logical search discarded the physical selection');
      await clickText('.mapping-start-picker header button','Schliessen');
      await evaluate("(()=>{const card=document.querySelector('.physical-representation');const r=card.getBoundingClientRect();card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+20,clientY:r.top+30}));})()");
      await waitFor("document.querySelector('.representation-context-menu')",'Physical card actions unavailable');
      await clickText('.representation-context-menu button','Logisches Modell ableiten');
      await waitFor("location.pathname==='/models/new'&&document.querySelector('.derived-origin')&&document.querySelector('textarea[formcontrolname=descriptionDe]')",'Derivation did not open the complete model form');
      invariant(cdp.interceptedTransfers.length===0,'Opening derivation created data before explicit Save');
      invariant(await evaluate(`new URL(location.href).searchParams.get('physicalSnapshotId')===${JSON.stringify(source.latestSnapshotId)}&&new URL(location.href).searchParams.get('physicalTableId')===${JSON.stringify(table.id)}&&document.querySelectorAll('.model-detail-tabs [role=tab]').length===3`),'Derivation lost its origin or omitted standard model tabs');
      const title=`Mapping derivation ${type} ${Date.now()}`,description=`User-authored ${type} logical model description.`;
      await setControls({'input[formcontrolname=titleDe]':title,'textarea[formcontrolname=descriptionDe]':description,'input[formcontrolname=identifiers]':`DERIVE-${type}-${Date.now()}`});
      await waitFor("document.querySelector('select[formcontrolname=dataOwnerId]')?.options.length>1",'Draft owner selection unavailable');
      await evaluate("(()=>{const select=document.querySelector('select[formcontrolname=dataOwnerId]');select.value=[...select.options].find(option=>option.value).value;select.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await capturePageSegmentScreenshot('daca-logical-model-editor',`derive-${type}-full-model-form.png`,1440,1000);
      await clickText('.model-detail-tabs button','Logische Entitäten und Felder');
      while(await evaluate("document.querySelectorAll('.field-table tbody tr').length>2"))await evaluate("[...document.querySelectorAll('.field-table tbody .remove-field')].at(-1).click()");
      for(let index=0;index<2;index++){
        await evaluate(`document.querySelectorAll('.field-select')[${index}].click()`);
        await waitFor("[...document.querySelectorAll('.field-list select[formcontrolname=entityBusinessObjectVersionId],.field-list select[formcontrolname=businessObjectVersionId]')].length===2&&[...document.querySelectorAll('.field-list select[formcontrolname=entityBusinessObjectVersionId],.field-list select[formcontrolname=businessObjectVersionId]')].every(select=>[...select.options].some(option=>option.value))",'Business object choices unavailable');
        await evaluate("(()=>{for(const select of document.querySelectorAll('.field-list select[formcontrolname=entityBusinessObjectVersionId],.field-list select[formcontrolname=businessObjectVersionId]')){select.value=[...select.options].find(option=>option.value).value;select.dispatchEvent(new Event('change',{bubbles:true}));}})()");
        await setControls({'.field-list input[formcontrolname=name]':`logical_field_${index}`,'.field-list select[formcontrolname=conceptMode]':'none'});
      }
      await clickText('button[type=submit]','Als Entwurf speichern');
      await waitFor("document.querySelector('.save-problem')",'Save failure did not preserve the full local form');
      invariant(cdp.interceptedTransfers.length===1,'Derivation did not use exactly one explicit save');
      const request=cdp.interceptedTransfers[0],payload=JSON.parse(request.postData);
      invariant(new URL(request.url).pathname===`/api/v1/physical-tables/${table.id}/derive-logical-model`,'Save used quick derivation or the wrong physical object');
      invariant(payload.logicalModel.localizations.some(item=>item.title===title&&item.description===description),'Edited logical metadata was omitted from Save');
      invariant(payload.fieldMappings.length===2&&payload.fieldMappings.every((mapping,index)=>mapping.physicalColumnId===table.columns[index].id&&mapping.logicalFieldName===`logical_field_${index}`),'Renaming/removing fields lost physical binding identity');
      invariant(await evaluate(`document.querySelector('textarea[formcontrolname=descriptionDe]').value===${JSON.stringify(description)}&&location.pathname==='/models/new'`),'Rejected Save lost user-authored metadata');
      const after=expectStatus(await api(actor,'/api/v1/logical-models'),200,'models after rejected save').body.items.map(item=>item.id).sort();
      invariant(JSON.stringify(before)===JSON.stringify(after),'Derivation preview unexpectedly persisted a model');
      console.log(`PASS ${type} physical derivation: canvas/card actions, mobile choices, scoped logical search, complete editable form, renamed/removed field bindings, explicit save payload and retained draft`);
    } finally {
      await cdp.call('Fetch.disable',{},sessionId);delete cdp.mockTransferResponse;
    }
  }
  invariant(cdp.runtimeExceptions.length===0,`Physical derivation raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
}

// Uses unique temporary Views; cleanup preserves immutable message history and audit records.
async function personalSearchViewsFlow() {
  const sender='christian.man',recipient='kassandra.valdata',prefix=`UI-Test View ${Date.now()}`;
  const viewsPath='/api/v1/me/search-views',sharesPath='/api/v1/me/search-view-shares';
  let sourceId,shareId,copyId;
  const actions=async(text)=>{await evaluate("document.querySelector('details.view-actions').open=true");await clickText('.view-action-list button',text);};
  try {
    await navigate('/search?q=Gebäude&kind=structure&connection=metadata&mode=focus&sort=name',sender);
    await waitFor("!document.querySelector('daca-search-views .view-select select').disabled",'Personal views did not load');
    await clickText('daca-search-views .view-toolbar-button','Neue View');
    await waitFor("document.querySelector('.view-dialog[open] input[name=name]')",'Create View modal missing');
    await setControls({'.view-dialog input[name=name]':prefix,'.view-dialog textarea[name=description]':'Temporäre Browserprüfung'});
    await captureScreenshot('search-view-create-desktop.png');
    await clickText('.view-dialog footer button','Speichern');
    await waitFor(`!document.querySelector('.view-dialog')&&document.querySelector('.view-select select').selectedOptions[0]?.textContent===${JSON.stringify(prefix)}`,'Created View was not selected');
    sourceId=await evaluate("document.querySelector('.view-select select').value");
    let saved=expectStatus(await api(sender,`${viewsPath}/${sourceId}`),200,'read newly created view').body;
    invariant(saved.configuration.query==='Gebäude'&&saved.configuration.mode==='focus'&&saved.configuration.kind==='structure'&&saved.configuration.connection==='metadata'&&saved.configuration.sort==='name','Saving lost existing search filters');
    await actions('Bearbeiten');await waitFor("document.querySelector('.view-dialog input[name=query]')",'Edit View filters missing');
    await setControls({'.view-dialog input[name=name]':prefix+' geteilt','.view-dialog input[name=query]':'VIBDBU'});
    await clickText('.view-dialog footer button','Speichern');
    await waitFor("!document.querySelector('.view-dialog')&&document.querySelector('#expert-search-input').value==='VIBDBU'",'Editing a View did not apply its filters');
    saved=expectStatus(await api(sender,`${viewsPath}/${sourceId}`),200,'read edited view').body;
    invariant(saved.revision===2,'View edit did not increment its revision');
    await actions('Teilen');await waitFor("document.querySelector('.view-dialog input[name=personQuery]')",'Recipient picker missing');
    await setControls({'.view-dialog input[name=personQuery]':'Kassandra'});
    await waitFor("document.querySelectorAll('.view-recipients input').length===1",'Recipient search did not narrow the directory');
    await evaluate("document.querySelector('.view-recipients input').click()");
    await setControls({'.view-dialog textarea[name=message]':'UI-Test: unabhängige Kopie, wird nach der Prüfung entfernt.'});
    await captureScreenshot('search-view-share-desktop.png');
    await clickText('.view-dialog footer button','View senden');
    await waitFor("!document.querySelector('.view-dialog')&&document.querySelector('.view-feedback')?.textContent.includes('versendet')",'Sharing did not confirm delivery');
    const received=expectStatus(await api(recipient,sharesPath),200,'read recipient view messages').body.find(item=>item.snapshot.name===prefix+' geteilt'&&item.senderUserId===sender);
    invariant(received,'Sharing did not create a recipient-private message');shareId=received.id;
    const frozen=JSON.stringify(received.snapshot.configuration);
    await actions('Bearbeiten');await setControls({'.view-dialog input[name=query]':'Nachträglich geändert'});
    await clickText('.view-dialog footer button','Speichern');await waitFor("!document.querySelector('.view-dialog')",'Second source edit did not finish');
    await actions('Löschen');await waitFor("document.querySelector('.view-dialog')?.textContent.includes('Geteilte')||document.querySelector('.view-dialog')?.textContent.includes('geteilte')",'Delete confirmation did not explain preserved copies');
    await clickText('.view-dialog footer button','Abbrechen');
    invariant(expectStatus(await api(sender,`${viewsPath}/${sourceId}`),200,'read cancelled View deletion').body.id===sourceId,'Cancelling deleted the View');
    await actions('Löschen');await clickText('.view-dialog footer button','Löschen');
    await waitFor("!document.querySelector('.view-dialog')&&document.querySelector('.view-select select').value===''",'Original View was not deleted');
    invariant(JSON.stringify(expectStatus(await api(recipient,`${sharesPath}/${shareId}`),200,'read sent copy after source deletion').body.snapshot.configuration)===frozen,'Sent filters changed with the original');
    sourceId=null;
    await navigate('/tasks',recipient);
    const messageLink=`.owner-task-card a[href="/search?sharedView=${shareId}"]`;
    await waitFor(`document.querySelector(${JSON.stringify(messageLink)})`,'Recipient notification did not link to the View');
    await evaluate(`document.querySelector(${JSON.stringify(messageLink)}).click()`);
    await waitFor(`document.querySelector('.view-dialog[open] .received-name')?.textContent===${JSON.stringify(prefix+' geteilt')}`,'Notification did not open the sent copy');
    await setViewport(390,844);await settleFrames();
    invariant(await evaluate("(()=>{const box=document.querySelector('.view-dialog').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;})()"),'Review popup overflows mobile viewport');
    await captureScreenshot('search-view-receive-mobile.png');
    await setControls({'.view-dialog input[name=adoptedName]':prefix+' Kopie'});
    await clickText('.view-dialog footer button','Als eigene View übernehmen');
    await waitFor("!document.querySelector('.view-dialog')&&document.querySelector('#expert-search-input').value==='VIBDBU'",'Adoption used the changed origin instead of the sent filters');
    copyId=await evaluate("document.querySelector('.view-select select').value");
    const adopted=expectStatus(await api(recipient,`${viewsPath}/${copyId}`),200,'read independent adopted view').body;
    invariant(adopted.ownerUserId===recipient&&JSON.stringify(adopted.configuration)===frozen,'Adoption did not create an independent exact filter copy');
    invariant(!expectStatus(await api(recipient,'/api/v1/tasks/mine'),200,'read completed View notification').body.some(task=>task.searchViewShareId===shareId),'Adoption left an open message');
    await setViewport(1440,900);await settleFrames();await captureScreenshot('search-view-adopted-desktop.png');
    await setControls({'#expert-search-input':''});
    await actions('Aktuelle Filter übernehmen');
    await waitFor("!document.querySelector('.view-modified')",'Current filters were not saved to the private copy');
    await navigate(`/search?view=${copyId}`,recipient,390,844);
    await waitFor(`document.querySelector('.view-select select')?.value===${JSON.stringify(copyId)}&&document.querySelector('[data-search-mode=focus]')?.getAttribute('aria-pressed')==='true'`,'Private View did not persist across a fresh page');
    invariant(await evaluate("document.querySelector('#expert-search-input').value===''&&!document.querySelector('.search-empty h3')?.textContent.includes('Zeichen')&&new URL(location.href).searchParams.has('q')"),'Filter-only View did not support an empty search phrase');
    await captureScreenshot('search-view-filter-only-mobile.png');
    await actions('Löschen');await clickText('.view-dialog footer button','Löschen');await waitFor("!document.querySelector('.view-dialog')",'Deleting the own copy failed');copyId=null;
    invariant(cdp.runtimeExceptions.length===0,`Views raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS personal search Views: create/edit/filter capture, recipient modal, notification link, immutable sent copy after source change/deletion, adoption, independent update, persisted filter-only mode, delete/cancel and mobile');
  } finally {
    // Clean up only exact test-owned names and pending messages; preserve append-only audit and message history.
    for(const actor of [sender,recipient]){
      const remaining=expectStatus(await api(actor,viewsPath),200,'list owned test Views for cleanup').body.filter(view=>view.name.startsWith(prefix));
      for(const view of remaining)expectStatus(await api(actor,`${viewsPath}/${view.id}`,{method:'DELETE',etag:`"${view.revision}"`}),204,'delete only browser test View');
    }
    const pending=expectStatus(await api(recipient,sharesPath),200,'read pending test messages for cleanup').body.filter(item=>item.senderUserId===sender&&item.snapshot.name.startsWith(prefix));
    for(const item of pending)expectStatus(await api(recipient,`${sharesPath}/${item.id}/dismiss`,{method:'POST',body:{}}),204,'dismiss only browser test message');
  }
}

// Read-only UI checks: actual SVG motion, native new tabs, hover/focus and mobile overflow.
async function lineageExplorerFlow() {
  const productId='11111111-1111-4111-8111-111111111111';
  await navigate(`/products/${productId}/lineage`,'kassandra.valdata');
  await setViewport(1920,1080);
  await waitFor("document.querySelector('.lineage-node[data-kind=consumer]')&&document.querySelector('.lineage-node[data-kind=product]')?.textContent.includes('ESTV')",'Live lineage graph did not load');
  await evaluate("document.querySelector('.lineage-toolbar').scrollIntoView({block:'start',behavior:'instant'})");
  invariant(await evaluate(`(()=>{const nodes=[...document.querySelectorAll('.lineage-node')],labels=[...document.querySelectorAll('.flow-label')];return labels.every(label=>{const a=label.getBoundingClientRect();return nodes.every(node=>{const b=node.getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;});})&&nodes.every(node=>node.querySelector('.lineage-node-title').scrollWidth<=node.querySelector('.lineage-node-title').clientWidth+1);})()`),'Lineage card text or edge labels overlap');
  invariant(await evaluate("getComputedStyle(document.querySelector('[data-kind=consumer]')).borderLeftColor===getComputedStyle(document.querySelector('.lineage-legend .is-consumer')).backgroundColor"),'Consumer does not match its green legend');
  invariant(await evaluate("!document.querySelector('.flow-edges marker')&&[...document.querySelectorAll('.daca-highway-band')].every(path=>getComputedStyle(path).stroke.includes('url(')&&getComputedStyle(path).strokeWidth==='12px')"),'Shared gradient highway style missing');
  invariant(await evaluate("[...document.querySelectorAll('.lineage-node')].every(node=>{const style=getComputedStyle(node);return node.offsetWidth===240&&node.offsetHeight===95&&style.borderRadius==='2px'&&style.borderLeftWidth==='3px'&&style.borderTopWidth==='1px'&&node.classList.contains('daca-canvas-object')&&node.querySelector('.canvas-object-type')&&node.querySelector('.canvas-object-title');})"),'Lineage cards differ from domain-network asset cards');
  invariant(await evaluate("document.querySelector('[data-kind=product]').dataset.canvasKind==='product'&&getComputedStyle(document.querySelector('[data-kind=product]')).borderLeftColor==='rgb(171, 123, 43)'"),'Product type lost its shared mustard stripe');
  invariant(await evaluate("(()=>{const card=document.querySelector('[data-kind=product]'),probe=document.createElement('span');probe.style.background='var(--daca-surface)';document.body.append(probe);const surface=getComputedStyle(probe).backgroundColor;probe.remove();return getComputedStyle(card).backgroundColor===surface&&card.querySelector('.lineage-node-owner')?.textContent.trim()==='Kassandra Valdata'&&card.getAttribute('aria-label').includes('Data Owner: Kassandra Valdata');})()"),'Selected product must retain the normal surface and show its Data Owner');

  const pulseState=()=>evaluate("[...document.querySelectorAll('.daca-highway-packet')].map(p=>({offset:parseFloat(getComputedStyle(p).offsetDistance),opacity:parseFloat(getComputedStyle(p.querySelector('.daca-highway-halo')).opacity),duration:p.getAnimations().find(a=>a.animationName?.includes('daca-packet-travel'))?.effect.getTiming().duration}))");
  const before=await pulseState();
  await sleep(240);
  const after=await pulseState();
  invariant(after.every((value,index)=>value.duration===3000&&(value.offset-before[index].offset+100)%100>3),'Packets must cross each visible edge in three seconds');
  invariant(after.some((value,index)=>Math.abs(value.opacity-before[index].opacity)>.01),'Packet halos do not pulse');
  const endpoints=await evaluate("[...document.querySelectorAll('.lineage-connection')].map(connection=>{const path=connection.querySelector('.daca-highway-band'),matrix=path.getScreenCTM(),under=length=>{const p=path.getPointAtLength(length).matrixTransform(matrix);return document.elementFromPoint(p.x,p.y)?.closest('.lineage-node')?.dataset.nodeId;};return{source:under(0)===connection.dataset.sourceId,target:under(path.getTotalLength())===connection.dataset.targetId};})");
  invariant(endpoints.every(edge=>edge.source&&edge.target),'Highway ends are not hidden under lineage cards');
  const occlusion=await evaluate("(()=>[...document.querySelectorAll('.lineage-connection')].flatMap(connection=>{const packet=connection.querySelector('.daca-highway-packet'),animation=packet.getAnimations().find(a=>a.animationName?.includes('daca-packet-travel'));animation.pause();return[.001,.999].map(phase=>{const timing=animation.effect.getTiming();animation.currentTime=timing.delay+timing.duration*phase;const r=packet.querySelector('.daca-highway-core').getBoundingClientRect(),actual=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.lineage-node')?.dataset.nodeId;const expected=phase<.5?connection.dataset.sourceId:connection.dataset.targetId,covered=[[0,0],[-8,-8],[8,-8],[-8,8],[8,8]].every(([x,y])=>document.elementFromPoint(r.left+r.width/2+x,r.top+r.height/2+y)?.closest('.lineage-node')?.dataset.nodeId===expected);return{phase,actual,expected,covered};});}))()");
  invariant(occlusion.every(sample=>sample.actual===sample.expected&&sample.covered),'Lineage packets must emerge from and disappear underneath their cards: '+JSON.stringify(occlusion));
  await capturePageSegmentScreenshot('.lineage-canvas-card','lineage-packets-under-boxes.png',1920,1080);
  await evaluate("document.querySelectorAll('.daca-highway-packet').forEach(packet=>packet.getAnimations().forEach(animation=>animation.play()))");

  await evaluate("document.querySelector('[data-kind=source]').focus()");await sleep(240);
  invariant(await evaluate("(()=>{const style=getComputedStyle(document.querySelector('[data-kind=source]'));return style.outlineStyle==='none'&&new DOMMatrixReadOnly(style.transform).m42===-2;})()"),'Card interaction must move the existing border without an extra outline');
  await pressKey('Escape','Escape',27);await evaluate('document.activeElement.blur()');
  await captureScreenshot('lineage-desktop.png');
  await capturePageSegmentScreenshot('.lineage-canvas-card','lineage-highway-canvas.png',1920,1080);
  await evaluate("document.documentElement.setAttribute('data-daca-theme','dark')");
  await capturePageSegmentScreenshot('.lineage-canvas-card','lineage-highway-dark.png',1920,1080);
  await evaluate("document.documentElement.removeAttribute('data-daca-theme')");
  for(const [term,expected] of [['Verified','Zertifikat dieser Quelle verfügbar'],['Declared','Quelle wurde durch den Data Owner manuell deklariert']]){
    await evaluate(`[...document.querySelectorAll('.legend-term')].find(button=>button.textContent===${JSON.stringify(term)}).focus()`);
    await waitFor(`document.querySelector('.daca-glossary-tooltip[role=tooltip]')?.textContent===${JSON.stringify(expected)}`,'Lineage term explanation missing');
    await pressKey('Escape','Escape',27);
  }
  await evaluate("document.querySelector('[data-kind=product]').focus()");
  await waitFor("document.querySelector('.lineage-summary a')",'Product hover summary missing');
  invariant(await evaluate("(()=>{const box=document.querySelector('.lineage-summary');return box.textContent.includes('Data Owner')&&box.textContent.includes('URN')&&box.querySelector('code').textContent.startsWith('urn:')&&!box.querySelector('code').textContent.startsWith('urn:daca:lineage:urn:')&&box.querySelector('a').target==='_blank';})()"),'Product summary metadata or native new-tab link missing');
  await captureScreenshot('lineage-product-summary.png');
  await pressKey('Tab','Tab',9);
  invariant(await evaluate("document.activeElement===document.querySelector('.lineage-summary a')"),'Cannot reach summary link with Tab');
  const href=await evaluate('document.activeElement.href');
  const targets=new Set((await cdp.call('Target.getTargets')).targetInfos.map(target=>target.targetId));
  await evaluate('document.activeElement.click()');
  let popup;const deadline=Date.now()+8000;
  while(!popup&&Date.now()<deadline){popup=(await cdp.call('Target.getTargets')).targetInfos.find(target=>target.type==='page'&&!targets.has(target.targetId)&&target.url===href);if(!popup)await sleep(100);}
  invariant(popup,'Summary did not open the product in a new tab');
  invariant(await evaluate(`location.pathname==='/products/${productId}/lineage'`),'Summary replaced the original diagram');
  await cdp.call('Target.closeTarget',{targetId:popup.targetId});await cdp.call('Page.bringToFront',{},sessionId);
  await pressKey('Escape','Escape',27);
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  invariant(await evaluate("[...document.querySelectorAll('.daca-highway-packet')].every(p=>getComputedStyle(p).animationName==='none'&&getComputedStyle(p).offsetDistance==='50%')"),'Reduced motion preference ignored');
  await evaluate("document.querySelector('[data-kind=source]').focus()");
  invariant(await evaluate("getComputedStyle(document.querySelector('[data-kind=source]')).transform==='none'"),'Reduced motion must also disable card movement');
  await pressKey('Escape','Escape',27);await evaluate('document.activeElement.blur()');
  await cdp.call('Emulation.setEmulatedMedia',{features:[]},sessionId);
  await setViewport(390,844);await settleFrames();
  invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Lineage page overflows mobile viewport');
  await evaluate("document.querySelector('.lineage-canvas').scrollIntoView({block:'center',behavior:'instant'});document.querySelector('.lineage-canvas').scrollLeft=0");
  await captureScreenshot('lineage-mobile.png');
  await evaluate("(()=>{const node=document.querySelector('[data-kind=consumer]');node.scrollIntoView({block:'center',inline:'center',behavior:'instant'});node.focus();})()");
  await waitFor("document.querySelector('.lineage-summary a')",'Mobile reference summary missing');
  invariant(await evaluate("(()=>{const box=document.querySelector('.daca-glossary-tooltip').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;})()"),'Mobile summary is outside viewport');
  const referenceUrl=await evaluate("document.querySelector('.lineage-summary a').href");
  const referenceUrn=await evaluate("document.querySelector('[data-kind=consumer]').dataset.nodeId");
  await captureScreenshot('lineage-mobile-consumer-summary.png');
  await navigate(referenceUrl,'kassandra.valdata');
  await waitFor(`document.querySelector('.lineage-detail h3')?.textContent===document.querySelector('[data-node-id="${referenceUrn}"] .lineage-node-title')?.textContent&&document.querySelector('[data-kind=consumer]')?.getAttribute('aria-pressed')==='true'`,'Reference deep link lost its selected consumer');
  invariant(cdp.runtimeExceptions.length===0,`Lineage raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS lineage-explorer: labels, semantic colors, glossary tooltips, moving impulses, keyboard summaries, native new tab, exact reference, reduced motion and mobile');
}

async function lineageAccessFlow() {
  const owner='kassandra.valdata',reader='mirjam.keller',product='11111111-1111-4111-8111-111111111111';
  const edge='31111111-1111-4111-8111-222222222222',route=`/products/${product}/lineage`,logs=`${route}/${edge}/access-events`;
  const endpoint=`/api/v1/data-products/${product}/lineage/${edge}/access-events`;
  const openEdge=async()=>{
    await waitFor(`document.querySelector('[data-edge-id="${edge}"]')`,'Live lineage edge missing');
    await evaluate(`(()=>{const path=document.querySelector('[data-edge-id="${edge}"]');path.scrollIntoView({block:'center',inline:'center',behavior:'instant'});const r=path.getBoundingClientRect();path.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:Math.min(innerWidth-20,r.left+r.width/2),clientY:r.top+r.height/2}));})()`);
    await waitFor("document.querySelector('.lineage-edge-menu')",'Edge context menu missing');await settleFrames();
  };
  await navigate(route,owner);
  // These are actual calls through OPA and forced RLS, not fixture access events.
  const person=await evaluate("(async()=>{const r=await fetch('/sample-api/api/v1/estv/tax-statistics',{headers:{'X-DaCa-User':'kanton-st-gallen'}});return {status:r.status,problem:r.ok?null:await r.json()};})()");
  invariant(person.status===200,`Live PEP person read failed: ${JSON.stringify(person)}`);
  const machine=await evaluate("(async()=>{const r=await fetch('/sample-api/api/v1/estv/tax-statistics',{headers:{'X-DaCa-Machine':'svc-estv-cantonal-tax-dashboard'}});return r.status;})()");
  invariant(machine===200||machine===403,`Live machine decision was unavailable: ${machine}`);
  const receipts=expectStatus(await api(owner,endpoint),200,'read actual access receipts').body;
  invariant(receipts.items.some(item=>item.subjectId==='kanton-st-gallen'&&item.subjectType==='person'&&item.outcome==='success'),'Real person read was not reported');
  invariant(receipts.items.some(item=>item.subjectId==='svc-estv-cantonal-tax-dashboard'&&item.subjectType==='machine'&&item.outcome===(machine===200?'success':'denied')),'Real machine outcome was not reported');
  invariant(expectStatus(await api(reader,endpoint),403,'deny non-owner direct API').body.items===undefined,'Denied API leaked receipts');
  await openEdge();
  invariant(await evaluate("document.activeElement===document.querySelector('.lineage-edge-menu a')"),'Owner menu did not focus its action');
  await captureScreenshot('lineage-owner-edge-menu.png');
  const href=await evaluate("document.querySelector('.lineage-edge-menu a').href");
  const existing=new Set((await cdp.call('Target.getTargets')).targetInfos.map(item=>item.targetId));
  await controlClick('.lineage-edge-menu a');
  let popup;const until=Date.now()+10000;
  while(!popup&&Date.now()<until){popup=(await cdp.call('Target.getTargets')).targetInfos.find(item=>item.type==='page'&&!existing.has(item.targetId)&&item.url===href);if(!popup)await sleep(100);}
  invariant(popup,'Access logs did not open a native new tab');
  invariant(await evaluate(`location.pathname===${JSON.stringify(route)}`),'Opening logs replaced the lineage diagram');
  const parent=sessionId;
  try{
    sessionId=(await cdp.call('Target.attachToTarget',{targetId:popup.targetId,flatten:true})).sessionId;
    await cdp.call('Runtime.enable',{},sessionId);await cdp.call('Page.enable',{},sessionId);
    await cdp.call('Page.setLifecycleEventsEnabled',{enabled:true},sessionId);
    await cdp.call('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);
    await cdp.call('Network.setBypassServiceWorker',{bypass:true},sessionId);
    await setViewport(1440,900);
    await waitFor("document.querySelector('.access-results tbody')?.textContent.includes('kanton-st-gallen')",'New-tab access log page lost the owner identity or receipt');
    await evaluate("document.querySelector('daca-lineage-access').scrollIntoView({block:'start',behavior:'instant'})");
    await settleFrames();await captureScreenshot('lineage-access-owner-desktop.png');
    await setControls({'select[name=outcome]':'','select[name=subject]':'machine'});
    await waitFor("document.querySelector('.access-results tbody')?.textContent.includes('svc-estv-cantonal-tax-dashboard')",'Machine filter did not show the actual receipt');
    invariant(await evaluate("!document.querySelector('.access-results tbody').textContent.includes('kanton-st-gallen')"),'Machine filter retained person data');
    await setViewport(390,844);await settleFrames();
    invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Access log page overflows mobile');
    await evaluate("document.querySelector('.access-results').scrollIntoView({block:'center',behavior:'instant'})");
    await captureScreenshot('lineage-access-mobile.png');
    cdp.deferReadPaths=new Set([endpoint]);cdp.deferredGenericReads=[];
    await cdp.call('Fetch.enable',{patterns:[{urlPattern:`*${endpoint}*`}]},sessionId);
    await cdp.call('Page.navigate',{url:href},sessionId);
    await waitFor("document.querySelector('daca-lineage-access .small-spinner')",'Access page spinner missing');
    await captureScreenshot('lineage-access-spinner.png');
    cdp.deferReadPaths.delete(endpoint);
    for(const pending of cdp.deferredGenericReads??[])await cdp.call('Fetch.continueRequest',{requestId:pending.requestId},pending.sessionId);
    await cdp.call('Fetch.disable',{},sessionId);delete cdp.deferReadPaths;cdp.deferredGenericReads=[];
    await waitFor("document.querySelector('.access-results tbody')",'Receipts did not return after loading');
  }finally{
    sessionId=parent;await cdp.call('Target.closeTarget',{targetId:popup.targetId});await cdp.call('Page.bringToFront',{},sessionId);
  }
  await navigate(route,reader);await openEdge();
  invariant(await evaluate("document.querySelector('.lineage-edge-menu button')?.disabled&&!document.querySelector('.lineage-edge-menu a')"),'Non-owner edge menu was not greyed out');
  await captureScreenshot('lineage-reader-edge-disabled.png');
  await pressKey('Escape','Escape',27);
  await navigate(logs,reader);
  await waitFor("document.querySelector('daca-lineage-access [role=alert]')?.textContent.includes('Nur der aktuelle Data Owner')",'Direct URL was not denied');
  invariant(await evaluate("!document.querySelector('.access-results')&&!document.body.textContent.includes('svc-estv-cantonal-tax-dashboard')"),'Denied page leaked previous receipts');
  await captureScreenshot('lineage-access-denied.png');
  invariant(cdp.runtimeExceptions.length===0,`Access logs raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS lineage-access: actual PEP person/machine receipts, strict owner API, edge menu, native new tab, filters, mobile, spinner, disabled non-owner menu and denied direct URL');
}

async function domainLoadingIndicatorsFlow() {
  const route='/domains?view=network',register='/api/v1/domains',network='/api/v1/semantic-graphs/domains';
  await navigate(route,'mirjam.keller');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sessionId);
  cdp.deferReadPaths=new Set([register,network]);cdp.deferredGenericReads=[];
  const release=async path=>{
    cdp.deferReadPaths.delete(path);
    const queued=cdp.deferredGenericReads.filter(item=>item.path===path);
    cdp.deferredGenericReads=cdp.deferredGenericReads.filter(item=>item.path!==path);
    for(const pending of queued)await cdp.call('Fetch.continueRequest',{requestId:pending.requestId},pending.sessionId);
  };
  const visible=async selector=>evaluate(`(()=>{const svg=document.querySelector(${JSON.stringify(selector)}),style=svg&&getComputedStyle(svg),rect=svg?.getBoundingClientRect();return !!svg&&svg.tagName.toLowerCase()==='svg'&&svg.clientWidth===20&&svg.clientHeight===20&&rect.width>=14&&rect.height>=14&&rect.top>=0&&rect.bottom<=innerHeight&&style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0&&svg.querySelector('path')?.getTotalLength()>5&&getComputedStyle(svg.querySelector('path')).stroke!=='none'&&svg.closest('[role=status]')?.textContent.trim().length>0;})()`);
  try{
    await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/domains*'},{urlPattern:'*/api/v1/semantic-graphs/domains'}]},sessionId);
    await cdp.call('Page.navigate',{url:new URL(route,baseUrl).href},sessionId);
    await waitFor("document.querySelector('.semantic-state svg.small-spinner')",'Register SVG spinner missing');
    invariant(await visible('.semantic-state .small-spinner'),'Register spinner is present but not visibly rendered');
    await captureScreenshot('domain-register-visible-spinner.png');await release(register);
    const selector='daca-domain-network .small-spinner';
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`,'Network spinner missing');
    invariant(await visible(selector),'Domain network spinner is present but not visibly rendered');
    const before=await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).transform`);
    await sleep(120);
    invariant(before!==await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).transform`),'Domain network spinner does not rotate');
    await captureScreenshot('domain-network-visible-spinner.png');
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    invariant(await visible(selector),'Reduced motion hides the loading ring');
    invariant(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).animationName==='none'`),'Reduced motion still animates the spinner');
    await evaluate("document.documentElement.dataset.dacaTheme='dark'");
    invariant(await visible(selector),'Dark theme hides the loading ring');
    await captureScreenshot('domain-network-static-dark-spinner.png');
    await evaluate("document.documentElement.dataset.dacaTheme='light'");
    await release(network);
    await waitFor("document.querySelector('.domain-network .semantic-graph')&&!document.querySelector('daca-domain-network .small-spinner')",'Network spinner remained after the read completed');
    invariant(cdp.runtimeExceptions.length===0,`Loading indicators raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS domain-loading-indicators: paused real register/network reads, visible 20px SVG geometry, actual rotation, static reduced-motion ring, dark theme and removal after completion');
  }finally{
    await cdp.call('Fetch.disable',{},sessionId);delete cdp.deferReadPaths;cdp.deferredGenericReads=[];
    await cdp.call('Emulation.setEmulatedMedia',{features:[]},sessionId);
  }
}

async function domainCanvasMobileLayoutFlow() {
  for(const width of [390,360]){
    await navigate('/domains?view=network','mirjam.keller',width,844);
    const pageLayout=await evaluate("(()=>{const root=document.documentElement;return {width:innerWidth,clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>root.clientWidth+1).slice(-18).map(el=>({tag:el.tagName,cls:el.className?.baseVal??el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))};})()");
    invariant(pageLayout.scrollWidth<=pageLayout.clientWidth+1,`Domain page overflows: ${JSON.stringify(pageLayout)}`);
    await evaluate("(()=>{const canvas=document.querySelector('.domain-network .semantic-graph');canvas.scrollIntoView({block:'center',behavior:'instant'});const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.right-25,clientY:Math.min(innerHeight-50,r.top+100)}));})()");
    await waitFor("document.querySelector('.domain-context-menu')",'Mobile domain menu missing');await settleFrames();
    invariant(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),'Domain menu creates page overflow');
    invariant(await evaluate("(()=>{const r=document.querySelector('.domain-context-menu').getBoundingClientRect();return r.left>=0&&r.right<=document.documentElement.clientWidth&&r.top>=0&&r.bottom<=innerHeight;})()"),'Domain menu leaves the layout viewport');
    await captureScreenshot(`domain-menu-mobile-${width}.png`);await pressKey('Escape','Escape',27);
  }
  console.log('PASS domain-canvas-mobile-layout: locally scrolling tabs, no page overflow and bounded menus at 390px and 360px');
}

async function domainCanvasApprovalFlow() {
  const creator='mirjam.keller',alds='christian.spider',name=`Canvas Approval QA ${Date.now()}`;
  const route='/domains?view=network&ownOffice=1';let request,domain;
  const release=async(path)=>{
    cdp.deferReadPaths.delete(path);
    const queued=(cdp.deferredGenericReads??[]).filter(item=>item.path===path);
    cdp.deferredGenericReads=(cdp.deferredGenericReads??[]).filter(item=>item.path!==path);
    for(const item of queued)await cdp.call('Fetch.continueRequest',{requestId:item.requestId},item.sessionId);
  };
  const finishDeferral=async()=>{await cdp.call('Fetch.disable',{},sessionId);delete cdp.deferReadPaths;cdp.deferredGenericReads=[];};
  const openCardMenu=async()=>{
    await evaluate("(()=>{const card=document.querySelector('.domain-network .graph-node[data-domain-id]');card.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const r=card.getBoundingClientRect();card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+25,clientY:r.top+25}));})()");
    await waitFor("document.querySelector('.domain-context-menu')",'Domain card menu missing');await settleFrames();
  };
  const openBlankMenu=async()=>{
    await evaluate("(()=>{const canvas=document.querySelector('.domain-network .semantic-graph');canvas.scrollIntoView({block:'center',behavior:'instant'});const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.right-45,clientY:Math.min(innerHeight-70,r.top+100)}));})()");
    await waitFor("document.querySelector('.domain-context-menu')",'Blank domain canvas menu missing');await settleFrames();
  };
  try {
    await navigate(route,creator);
    const baseline=expectStatus(await api(creator,'/api/v1/semantic-graphs/domains'),200,'read shared domain layout').body;
    cdp.deferReadPaths=new Set(['/api/v1/domains','/api/v1/semantic-graphs/domains']);cdp.deferredGenericReads=[];
    await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/domains*'},{urlPattern:'*/api/v1/semantic-graphs/domains'}]},sessionId);
    await cdp.call('Page.navigate',{url:new URL(route,baseUrl).href},sessionId);
    await waitFor("document.querySelector('.semantic-state .small-spinner')",'Semantic register spinner missing');
    await captureScreenshot('domain-register-spinner.png');await release('/api/v1/domains');
    await waitFor("document.querySelector('daca-domain-network .small-spinner')",'Domain network spinner missing');
    await captureScreenshot('domain-network-spinner.png');await release('/api/v1/semantic-graphs/domains');await finishDeferral();
    await waitFor("document.querySelector('.domain-network .graph-node[data-domain-id]')",'Own-office domain cards did not load');
    await openCardMenu();
    const menu=await evaluate("[...document.querySelectorAll('.domain-context-menu [role=menuitem]')].map(item=>({text:item.textContent.trim(),target:item.getAttribute('target'),href:item.getAttribute('href')}))");
    invariant(menu[0].text==='Diese Domäne öffnen'&&menu.at(-3).text==='Darstellung dieser Domäne entfernen','Domain actions must start with open and end with removing its drawing before the general model searches');
    invariant(await evaluate("document.querySelectorAll('.domain-context-menu hr').length===3"),'Domain card action groups missing');
    const semantic=menu.filter(item=>/^(Term|Domäne) suchen und öffnen/.test(item.text));
    invariant(semantic.length===2&&semantic.every(item=>!item.target&&new URL(item.href,baseUrl).searchParams.get('q')),'Named semantic links must open in new tabs');
    await captureScreenshot('domain-card-grouped-menu.png');await pressKey('End','End',35);
    invariant(await evaluate("document.activeElement.textContent.includes('Physisches Modell')"),'Menu End navigation failed');await pressKey('Escape','Escape',27);
    await openBlankMenu();
    invariant(await evaluate("document.querySelector('.domain-context-menu [role=menuitem]').textContent.trim()==='Domäne erstellen …'&&!document.querySelector('.domain-context-menu').textContent.includes('Term suchen')"),'Blank canvas must start with creation without named semantic searches');
    await captureScreenshot('domain-canvas-grouped-menu.png');
    cdp.deferReadPaths=new Set(['/api/v1/domains']);cdp.deferredGenericReads=[];
    await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/domains*'}]},sessionId);
    await clickText('.domain-context-menu button','Domäne erstellen');
    await waitFor("document.querySelector('.create-backdrop .small-spinner')",'Domain form spinner missing');
    await release('/api/v1/domains');await finishDeferral();
    await waitFor("document.querySelector('.create-backdrop input[name=label]')",'Domain proposal form missing');
    invariant(await evaluate("document.querySelector('.create-backdrop').textContent.includes('ALDS')"),'Domain form does not explain its approval requirement');
    await setControls({'.create-backdrop input[name=label]':name,'.create-backdrop textarea[name=definition]':'Synthetic canvas approval check. Removed from active catalog after verification.','.create-backdrop select[name=owner]':'daniel.wenger','.create-backdrop select[name=deputy]':'eliane.rossi'});
    await captureScreenshot('domain-canvas-approval-form.png');await clickText('.create-backdrop button','ALDS-Freigabe');
    await waitFor(`document.querySelector('.domain-network .is-pending strong')?.textContent===${JSON.stringify(name)}`,'Submitted domain did not remain a personal proposal');
    request=expectStatus(await api(creator,'/api/v1/domain-change-requests'),200,'read submitted canvas request').body.find(item=>item.requestedPayload.localizations?.some(label=>label.preferredLabel===name));
    invariant(request?.status==='submitted'&&!request.targetDomainId,'Proposal activated before ALDS approval');
    invariant(!expectStatus(await api(creator,`/api/v1/domains?q=${encodeURIComponent(name)}`),200,'check active domains before approval').body.length,'Pending domain is visible in the active catalog');
    invariant(JSON.stringify(expectStatus(await api(creator,'/api/v1/semantic-graphs/domains'),200,'read layout after personal proposal').body)===JSON.stringify(baseline),'Personal proposal changed the shared graph');
    const denied=await api('daniel.wenger',`/api/v1/domain-change-requests/${request.id}/decision`,{method:'POST',etag:`"${request.revision}"`,body:{decision:'approve',comment:'Expected denial: Owner is not the office ALDS.'}});
    expectStatus(denied,403,'deny domain Owner approval');
    await navigate(route,creator);
    await waitFor(`document.querySelector('.domain-network .is-pending strong')?.textContent===${JSON.stringify(name)}`,'Personal proposal did not survive reload');
    await setViewport(390,844);await openBlankMenu();
    invariant(await evaluate("(()=>{const r=document.querySelector('.domain-context-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"),'Domain menu overflows mobile viewport');
    await captureScreenshot('domain-canvas-menu-mobile.png');await pressKey('Escape','Escape',27);
    const tasks=expectStatus(await api(alds,'/api/v1/tasks/mine'),200,'read scoped ALDS tasks').body;
    invariant(tasks.some(task=>task.domainChangeRequestId===request.id),'Canvas request did not notify the scoped ALDS');
    await navigate('/domains/governance',alds);
    await waitFor(`[...document.querySelectorAll('.governance-row')].some(row=>row.textContent.includes(${JSON.stringify(name)})&&[...row.querySelectorAll('button')].some(button=>button.textContent==='Genehmigen'))`,'ALDS cannot review the submitted domain');
    await evaluate(`(()=>{const row=[...document.querySelectorAll('.governance-row')].find(row=>row.textContent.includes(${JSON.stringify(name)}));[...row.querySelectorAll('button')].find(button=>button.textContent==='Genehmigen').click();})()`);
    await waitFor("document.body.innerText.includes('Domain-Antrag genehmigt.')",'ALDS approval did not complete');
    const accepted=expectStatus(await api(creator,'/api/v1/domain-change-requests'),200,'read ALDS decision').body.find(item=>item.id===request.id);
    invariant(accepted?.status==='approved'&&accepted.reviewerUserId===alds,'Wrong reviewer or decision persisted');
    domain=expectStatus(await api(creator,`/api/v1/domains/${accepted.targetDomainId}`),200,'read ALDS-approved domain').body;
    await navigate(route,creator);
    await waitFor(`document.querySelector('[data-domain-id="${domain.id}"]')&&!document.querySelector('.domain-network .is-pending')`,'Approved domain did not replace the personal proposal');
    invariant(domain.ownerUserId==='daniel.wenger','Approval changed the proposed object Owner');
    await captureScreenshot('domain-approved-on-canvas.png');
    await clickText('.domain-network .draft-actions button','Entwurf verwerfen');
    invariant(cdp.runtimeExceptions.length===0,`Domain canvas raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS domain-canvas-approval: grouped card/blank menus, three loader stages, personal proposal and reload, no shared graph mutation, Owner denial, scoped ALDS task/UI approval, mobile menu bounds');
  } finally {
    if(cdp.deferReadPaths)await finishDeferral();
    if(request&&!domain){const current=expectStatus(await api(creator,'/api/v1/domain-change-requests'),200,'read only test request for cleanup').body.find(item=>item.id===request.id);if(current?.status==='submitted')expectStatus(await api(alds,`/api/v1/domain-change-requests/${request.id}/decision`,{method:'POST',etag:`"${current.revision}"`,body:{decision:'reject',comment:'Cleanup of unique synthetic canvas test request.'}}),200,'reject only synthetic pending request');else if(current?.targetDomainId)domain=expectStatus(await api(creator,`/api/v1/domains/${current.targetDomainId}`),200,'read only approved test domain').body;}
    if(domain?.lifecycle==='active')expectStatus(await api('daniel.wenger',`/api/v1/domains/${domain.id}/retire`,{method:'POST',etag:`"${domain.revision}"`,body:{}}),200,'retire only the unique test domain');
  }
}

async function sourceInfoNoticesFlow() {
  await navigate('/physical-models','mirjam.keller');
  const visible="document.querySelectorAll('daca-info-notice:not([hidden])').length";
  invariant(await evaluate(visible+'===2'),'Expected two dismissible source notices');
  await setControls({'.source-search input':'VIBDBU'});
  invariant(await evaluate("[...document.querySelectorAll('.source-notice a')].some(link=>link.getAttribute('href')==='/search?q=VIBDBU')"),'Expert search lost the source query');
  invariant(await evaluate("[...document.querySelectorAll('.source-notice a')].some(link=>link.getAttribute('href')==='/domains')&&document.querySelectorAll('.source-notice')[1].textContent.includes('Owner')"),'Discovery text or domain link missing');
  invariant(await evaluate("[...document.querySelectorAll('daca-info-notice')].every(notice=>{const box=notice.getBoundingClientRect(),button=notice.querySelector('.info-notice-close'),close=button.getBoundingClientRect();return button.getAttribute('aria-label')&&close.right<=box.right&&close.left>=box.right-45&&close.top>=box.top;})"),'Notice X must sit inside its right edge with an accessible label');
  await captureScreenshot('source-info-notices-desktop.png');
  await evaluate("document.querySelector('.info-notice-close').click()");
  await waitFor(visible+'===1','Dismissing one notice affected another');
  await evaluate("document.querySelector('daca-info-notice:not([hidden]) .info-notice-close').focus()");
  await pressKey('Enter','Enter',13);
  await waitFor(visible+'===0','Keyboard dismissal failed');
  await evaluate("document.querySelector('.archive-toggle input').click()");
  await waitFor("!document.body.innerText.includes('werden geladen')",'Source filter refresh did not finish');
  invariant(await evaluate(visible+'===0'),'Data refresh reopened dismissed notices');
  await navigate('/physical-models','mirjam.keller',390,844);
  invariant(await evaluate(visible+'===2'),'Reload did not restore source notices');
  invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Source notices overflow on mobile');
  await captureScreenshot('source-info-notices-mobile.png');
  invariant(cdp.runtimeExceptions.length===0,`Source notices raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS source-info-notices: independent click/keyboard dismissal, refresh retention, reload reset, discovery links and mobile bounds');
}

async function mappingStatusTooltipsFlow() {
  await navigate('/models/901c036e-f09c-425e-af89-e8daf0b95a37/mappings?view=graph','mirjam.keller');
  await waitFor("document.querySelectorAll('.graph-legend>span[tabindex]').length===3",'Mapping legend did not load');
  for(const group of ['.graph-legend','.mapping-counts']){
    for(const [index,explanation] of ['erfolgreich validiert','Entwurf','Strukturänderung'].entries()){
      await evaluate(`document.querySelectorAll('${group}>span')[${index}].focus()`);
      await waitFor(`(()=>{const host=document.querySelectorAll('${group}>span')[${index}];return document.getElementById(host.getAttribute('aria-describedby'))?.textContent.includes(${JSON.stringify(explanation)});})()`,'Mapping status explanation missing');
      if(group==='.graph-legend'&&index===2)await captureScreenshot('mapping-status-broken-tooltip.png');
      await pressKey('Escape','Escape',27);await evaluate('document.activeElement.blur()');
    }
  }
  await evaluate("document.querySelector('.graph-legend>span').dispatchEvent(new MouseEvent('mouseenter'))");
  await waitFor("[...document.querySelectorAll('.daca-glossary-tooltip')].some(tooltip=>tooltip.textContent.includes('erfolgreich validiert'))",'Mapping legend hover tooltip missing');
  await evaluate("document.querySelector('.graph-legend>span').dispatchEvent(new MouseEvent('mouseleave'))");
  await pressKey('Escape','Escape',27);
  invariant(cdp.runtimeExceptions.length===0,`Mapping tooltips raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS mapping-status-tooltips: all three legend statuses and toolbar counters, keyboard focus with auto-scroll, Escape and pointer hover');
}

async function physicalDomainRemovalFlow() {
  const actor='mirjam.keller',modelId=args.get('--model-id')??'901c036e-f09c-425e-af89-e8daf0b95a37',route=`/models/${modelId}/mappings?view=graph`;
  await navigate(route,actor);
  await waitFor("[...document.querySelectorAll('.physical-qualified-name')].some(node=>node.textContent==='SAP.CSV.VIBDBU')",'CSV declaration not loaded');
  const tableId=await evaluate("[...document.querySelectorAll('.physical-representation')].find(card=>card.querySelector('.physical-qualified-name')?.textContent==='SAP.CSV.VIBDBU').dataset.representationTableId");
  const bindings=expectStatus(await api(actor,`/api/v1/logical-models/${modelId}/representations`),200,'read bindings').body.items;
  const snapshotId=bindings.find(item=>item.physicalTableId===tableId).physicalSnapshotId;
  const read=`/api/v1/physical-tables/${tableId}/domains`,assign=`/api/v1/physical-tables/${tableId}/domain-assignment`;
  const original=expectStatus(await api(actor,read),200,'read original domains').body,chosen=original.dataDomains[0];
  invariant(chosen,'This review fixture must have an assigned domain');
  const removal=`/api/v1/physical-tables/${tableId}/domain-assignments/${chosen.id}`;
  const mappingsPath=`/api/v1/asset-mappings?logicalModelId=${modelId}`,before=JSON.stringify(expectStatus(await api(actor,mappingsPath),200,'read baseline mappings').body);
  const selector=`.physical-representation[data-representation-table-id="${tableId}"]`;
  const openCard=async()=>{await evaluate(`(()=>{const card=document.querySelector(${JSON.stringify(selector)});card.scrollIntoView({block:'center',inline:'center',behavior:'instant'});const r=card.getBoundingClientRect();card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+30,clientY:r.top+30}));})()`);await waitFor("document.querySelector('.representation-context-menu')",'Physical menu missing');};
  const removeItem=async()=>{await evaluate("[...document.querySelectorAll('.representation-context-menu button')].find(button=>button.textContent.includes('Domänenzuordnung entfernen')).click()");await waitFor(`!document.querySelector(${JSON.stringify(selector+' .model-domain')}).textContent.includes(${JSON.stringify(chosen.displayName)})`,'Domain label did not update after removal');};
  const restore=async()=>{
    const state=expectStatus(await api(actor,read),200,'read restoration version').body;
    if(!state.dataDomains.some(domain=>domain.id===chosen.id))expectStatus(await api(actor,assign,{method:'POST',body:{dataDomainId:chosen.id,physicalDomainTargets:[{physicalTableId:tableId,physicalSnapshotId:snapshotId,expectedDomainVersion:state.domainVersion}]}}),200,'restore only the removed fixture membership');
  };
  try{
    const target={physicalTableId:tableId,physicalSnapshotId:snapshotId,expectedDomainVersion:original.domainVersion};
    expectStatus(await api('daca-test-editor',removal,{method:'DELETE',body:target}),403,'deny unauthorized removal');
    await evaluate(`(()=>{const trigger=document.querySelector('.representation-card:has([data-representation-id="${tableId}"]) .representation-menu-trigger');trigger.scrollIntoView({block:'center',behavior:'instant'});trigger.focus();})()`);await pressKey('ArrowDown','ArrowDown',40);
    await waitFor("document.querySelector('.binding-context-menu')",'Binding actions unavailable');
    invariant(await evaluate("document.querySelector('.binding-context-menu .menu-hint').nextElementSibling.tagName!=='HR'"),'Separator after the preserved-bindings hint remains');
    await captureScreenshot('physical-domain-remove-binding.png');await removeItem();
    const removed=expectStatus(await api(actor,read),200,'read removed domain').body;
    invariant(JSON.stringify(removed.dataDomains.map(domain=>domain.id).sort())===JSON.stringify(original.dataDomains.filter(domain=>domain.id!==chosen.id).map(domain=>domain.id).sort()),'Removing one membership changed another');
    invariant(JSON.stringify(expectStatus(await api(actor,mappingsPath),200,'mappings after removal').body)===before,'Domain removal changed mappings');
    await navigate(route,actor);await waitFor(`document.querySelector(${JSON.stringify(selector+' .model-domain')})&&!document.querySelector(${JSON.stringify(selector+' .model-domain')}).textContent.includes(${JSON.stringify(chosen.displayName)})`,'Removal was not preserved on reload');
    await captureScreenshot('physical-domain-removed-canvas.png');
    const physicalRoute=`/mappings/physical/${snapshotId}/${tableId}`;
    await navigate(physicalRoute,actor);await openCard();
    if(original.dataDomains.length===1){
      await clickText('.representation-context-menu button','Domäne zuordnen');
      await waitFor(`document.querySelector('daca-model-domain-dialog option[value="${chosen.id}"]')&&!document.querySelector('daca-model-domain-dialog select')?.disabled`,'Physical-only assignment form unavailable');
      await setControls({'.domain-select select':chosen.id});await clickText('daca-model-domain-dialog footer button','Zuordnen');
      await waitFor(`!document.querySelector('daca-model-domain-dialog')&&document.querySelector(${JSON.stringify(selector+' .model-domain')}).textContent.includes(${JSON.stringify(chosen.displayName)})`,'Physical-only reassignment failed');
    }else{await pressKey('Escape','Escape',27);await restore();await navigate(physicalRoute,actor);}
    await openCard();await removeItem();
    await captureScreenshot('physical-domain-removed-physical-start.png');
    invariant(expectStatus(await api(actor,read),200,'read physical-only removal').body.dataDomains.every(domain=>domain.id!==chosen.id),'Physical-only removal did not persist');
    invariant(JSON.stringify(expectStatus(await api(actor,mappingsPath),200,'final mapping guard').body)===before,'Physical-only removal changed mappings');
    invariant(cdp.runtimeExceptions.length===0,`Domain removal raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS physical-domain-removal: scoped API, removed separator, binding/canvas update, persisted reload, physical-only remove/reassign and unchanged mappings; original membership restored');
  }finally{await restore();}
}

async function physicalObjectActionsFlow() {
  const actor='mirjam.keller',modelId=args.get('--model-id')??'901c036e-f09c-425e-af89-e8daf0b95a37';
  await navigate(`/models/${modelId}/mappings?view=graph`,actor);
  await waitFor("document.querySelector('.physical-qualified-name')",'Physical object did not load');
  const identity=await evaluate("(()=>{const card=[...document.querySelectorAll('.physical-representation')].find(card=>card.querySelector('.physical-qualified-name')?.textContent==='SAP.CSV.VIBDBU');return card?{id:card.dataset.representationTableId,label:card.querySelector('.physical-qualified-name').textContent}:null;})()");
  invariant(identity,'SAP.CSV.VIBDBU is missing from the multi-system inventory');
  const mappingsPath=`/api/v1/asset-mappings?logicalModelId=${modelId}`;
  const before=JSON.stringify(expectStatus(await api(actor,mappingsPath),200,'Mappings before menu review').body);
  const binding=`.representation-card:has([data-representation-id="${identity.id}"])`;
  invariant(await evaluate(`document.querySelector(${JSON.stringify(binding)})?.querySelector('strong').textContent==='SAP.CSV.VIBDBU'`),'Binding uses a different system prefix');
  invariant(await evaluate(`document.querySelector(${JSON.stringify(binding)})?.textContent.includes('Physische Deklaration')`),'Binding declaration label missing');
  invariant(await evaluate("document.querySelector('.logical-node>header>span').textContent==='Logisches Modell'"),'Logical model label missing');
  await evaluate("(()=>{const canvas=document.querySelector('.graph-canvas');document.querySelector('.graph-scroll').scrollTop=0;document.querySelector('.mapping-shell').scrollIntoView({block:'start',behavior:'instant'});const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+450,clientY:r.top+80}));})()");
  await waitFor("document.querySelector('.canvas-context-menu')",'Canvas menu unavailable for review');
  await settleFrames();await captureScreenshot('canvas-grouped-actions-desktop.png');
  await pressKey('Escape','Escape',27);
  const openBinding=async()=>{
    await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(binding+' .representation-menu-trigger')});button.scrollIntoView({block:'center',behavior:'instant'});button.focus();})()`);
    await pressKey('ArrowDown','ArrowDown',40);
    await waitFor("document.querySelector('.binding-context-menu')?.contains(document.activeElement)",'Binding menu did not receive keyboard focus');
  };
  await openBinding();
  const menuItems=()=>evaluate("[...document.querySelectorAll('.representation-context-menu [role=menuitem]')].map(item=>({text:item.textContent.replace(' (neuer Tab)','').replace(' (Treffer in neuem Tab)','').trim(),href:item.getAttribute('href'),target:item.getAttribute('target')}))");
  const bindingItems=await menuItems();
  invariant(bindingItems[0].text==='Datenquelle öffnen','Source navigation must be first');
  invariant(bindingItems[1].text==='Darstellung dieser Physischen Repräsentation/Deklaration löschen','Drawing removal must immediately follow source navigation');
  const semantic=bindingItems.filter(item=>/^(Term|Domäne) suchen/.test(item.text));
  invariant(semantic.length===2&&semantic.every(item=>!item.target&&new URL(item.href,baseUrl).searchParams.get('q')==='VIBDBU'),'Semantic searches must open named queries in new tabs');
  invariant(await evaluate("document.querySelectorAll('.binding-context-menu hr').length===2&&!document.querySelector('.binding-context-menu img[src$=\"external-link.svg\"]')"),'Menu groups or modifier-only navigation icons are incorrect');
  await captureScreenshot('physical-binding-actions-desktop.png');
  const sourceUrl=bindingItems[0].href;
  await pressKey('Escape','Escape',27);
  invariant(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(binding+' .representation-menu-trigger')})`),'Binding menu did not restore focus');
  const originalTargets=new Set((await cdp.call('Target.getTargets')).targetInfos.map(target=>target.targetId));
  await openBinding();await controlClick('.binding-context-menu a');
  let sourceTab;const popupDeadline=Date.now()+8000;
  while(!sourceTab&&Date.now()<popupDeadline){sourceTab=(await cdp.call('Target.getTargets')).targetInfos.find(target=>target.type==='page'&&!originalTargets.has(target.targetId)&&target.url===new URL(sourceUrl,baseUrl).href);if(!sourceTab)await sleep(100);}
  invariant(sourceTab,'Source navigation did not open the exact source/snapshot/object in a new tab');
  invariant(await evaluate(`location.pathname==='/models/${modelId}/mappings'`),'Source navigation replaced the mapping workspace');
  await cdp.call('Target.closeTarget',{targetId:sourceTab.targetId});await cdp.call('Page.bringToFront',{},sessionId);
  await evaluate(`(()=>{const card=document.querySelector('[data-representation-table-id="${identity.id}"]');card.querySelector('header').scrollIntoView({block:'center',behavior:'instant'});const rect=card.querySelector('header').getBoundingClientRect();card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.left+15,clientY:rect.top+15}));})()`);
  await waitFor("document.querySelector('daca-mapping-graph .representation-context-menu')",'Canvas actions missing');
  invariant(JSON.stringify(await menuItems())===JSON.stringify(bindingItems),'Canvas and binding menus differ');
  await captureScreenshot('physical-canvas-actions-desktop.png');
  await pressKey('Escape','Escape',27);
  await openBinding();
  if(bindingItems.some(item=>item.text==='Domäne des logischen Modells zuordnen')){
    await clickText('.binding-context-menu button','Domäne des logischen Modells zuordnen');
    await waitFor("document.querySelector('daca-model-domain-dialog dialog[open] select')?.disabled&&document.querySelector('daca-model-domain-dialog select').value!==''",'Copying domain bypassed the confirmation dialog');
    invariant(await evaluate("document.querySelector('daca-model-domain-dialog select').value!==''"),'Logical model domain was not preselected');
    await clickText('daca-model-domain-dialog footer button','Abbrechen');
  }else await pressKey('Escape','Escape',27);
  await openBinding();await clickText('.binding-context-menu button','Physisches Modell suchen und öffnen');
  await waitFor("document.querySelector('.object-browser-backdrop .object-result')&&!document.querySelector('.object-browser-backdrop [role=alert]')",'Physical object search did not load');
  await setControls({'.object-browser-backdrop input':'VIBDBU'});
  invariant(await evaluate("[...document.querySelectorAll('.object-result')].some(button=>button.querySelector('strong').textContent==='SAP.CSV.VIBDBU'&&button.textContent.includes('Quelle: Gebäude · Physische Deklaration (CSV)'))"),'Physical search does not identify the CSV object origin');
  invariant(await evaluate("[...document.querySelectorAll('.object-result')].some(button=>button.querySelector('strong').textContent==='daca_sample.public.VIBDBU'&&button.textContent.includes('Physische Repräsentation (PostgreSQL)'))"),'Physical search does not distinguish the connected object');
  await evaluate("[...document.querySelectorAll('.object-result')].find(button=>button.querySelector('strong').textContent==='SAP.CSV.VIBDBU'&&button.textContent.includes('Quelle: Gebäude ·')).parentElement.querySelector('.provenance-info').focus()");
  await waitFor("document.querySelector('.daca-glossary-tooltip.is-visible')?.textContent.includes('Quellen-ID:')&&document.querySelector('.daca-glossary-tooltip.is-visible').textContent.includes('Data Owner:')",'Origin details are not accessible by keyboard');
  invariant(await evaluate(`location.pathname==='/models/${modelId}/mappings'`),'Origin inspection navigated away');
  await settleFrames();await captureScreenshot('physical-search-origin-desktop.png');
  async function openSearchHitInNewTab(selector,expectedPath){
    const targets=new Set((await cdp.call('Target.getTargets')).targetInfos.map(target=>target.targetId));
    const href=await evaluate(`document.querySelector(${JSON.stringify(selector)}).href`);
    await controlClick(selector);
    let resultTab;const until=Date.now()+8000;
    while(!resultTab&&Date.now()<until){resultTab=(await cdp.call('Target.getTargets')).targetInfos.find(target=>target.type==='page'&&!targets.has(target.targetId)&&target.url===href);if(!resultTab)await sleep(100);}
    invariant(resultTab&&new URL(resultTab.url).pathname===expectedPath,'Model search did not open the selected target in a new tab');
    invariant(await evaluate(`location.pathname==='/models/${modelId}/mappings'&&!document.querySelector('.object-browser-backdrop')`),'Model search replaced the original Mapping or retained the search modal');
    await cdp.call('Target.closeTarget',{targetId:resultTab.targetId});await cdp.call('Page.bringToFront',{},sessionId);
  }
  await openSearchHitInNewTab(`.object-browser-backdrop a.object-result[href="${sourceUrl}"]`,new URL(sourceUrl,baseUrl).pathname);
  await openBinding();await clickText('.binding-context-menu button','Logisches Modell suchen und öffnen');
  await waitFor(`document.querySelector('.object-browser-backdrop a.object-result[href="/models/${modelId}"]')`,'Logical model search did not offer native new-tab result links');
  await openSearchHitInNewTab(`.object-browser-backdrop a.object-result[href="/models/${modelId}"]`,`/models/${modelId}`);
  await setViewport(390,844);await settleFrames();await openBinding();
  invariant(await evaluate("(()=>{const r=document.querySelector('.binding-context-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"),'Binding menu overflows mobile viewport');
  await captureScreenshot('physical-binding-actions-mobile.png');
  await pressKey('Escape','Escape',27);
  invariant(JSON.stringify(expectStatus(await api(actor,mappingsPath),200,'Mappings after menu review').body)===before,'Menu review changed persisted mappings');
  await navigate(sourceUrl,actor);
  await waitFor("document.querySelector('daca-physical-object-detail h2')",'Source navigation did not load');
  invariant(await evaluate(`location.search.includes('tableId=${identity.id}')&&document.querySelector('.detail-heading').textContent.includes('Physische Deklaration')`),'Source navigation lost the object or declaration category');
  await navigate('/physical-models',actor);
  const sourceId=new URL(sourceUrl,baseUrl).pathname.split('/').at(-1);
  await openSourceCardMenu(sourceId);
  invariant(await evaluate(`(()=>{const card=document.querySelector('[data-source-id="${sourceId}"]');return card.textContent.includes('Physische Deklaration')&&card.querySelectorAll('[role=menuitem]').length===3&&!card.querySelector('.actions');})()`),'CSV inventory actions are not in the shared menu');
  await capturePageSegmentScreenshot('.source-grid','physical-source-actions-desktop.png',1440,900);
  invariant(cdp.runtimeExceptions.length===0,`Physical menus raised browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS physical-object-actions: SAP prefix, categories, shared menu order, keyboard, new-tab queries, copy confirmation, source navigation, mobile, unchanged mappings');
}


async function recentWorkFlow(){
  const actor='kassandra.valdata';
  await navigate('/',actor,1440,1100);
  const read=expectStatus(await api(actor,'/api/v1/me/recent-work'),200,'read recent saved edits');
  invariant(read.headers['cache-control']==='no-store','recent edits must not be cached across identities');
  const expected=read.body.categories.filter(group=>group.items.length);
  invariant(read.body.categories.length===4&&read.body.categories.every(group=>group.items.length<=3&&new Set(group.items.map(item=>item.kind+':'+item.id)).size===group.items.length),'recent edit categories exceed three or contain duplicates');
  await waitFor("document.querySelector('daca-recent-work')&&!document.querySelector('daca-recent-work .recent-state[role=status]')",'recent edits remained loading or failed');
  invariant(await evaluate("document.querySelectorAll('.recent-category').length")===expected.length,'empty categories were displayed or populated categories omitted');
  for(const group of expected)for(const item of group.items){
    invariant(await evaluate(`(()=>{const row=document.querySelector('.recent-category[data-category="${group.id}"] [data-work-id="${item.id}"]'),a=row?.querySelector('a'),url=a?new URL(a.href):null;return !!url&&url.pathname===${JSON.stringify(item.route)}&&Object.entries(${JSON.stringify(item.queryParams)}).every(([key,value])=>url.searchParams.get(key)===value)&&row.querySelector('time')?.getAttribute('datetime')===${JSON.stringify(item.editedAt)};})()`),'recent-work link or timestamp differs from its current authorized item');
  }
  invariant(await evaluate("(()=>{const canvas=document.querySelector('daca-organization-canvas').getBoundingClientRect(),search=document.querySelector('.welcome-search').getBoundingClientRect(),work=document.querySelector('.recent-work').getBoundingClientRect();return search.left>=canvas.right-2&&work.top>=search.bottom-2;})()"),'recent work is not below the right-hand search');
  await capturePageSegmentScreenshot('.welcome-workspace','recent-work-desktop.png',1440,1100);
  let term=read.body.categories.find(group=>group.id==='terms')?.items[0];
  let visualFixture=null;
  // Only this isolated browser response is mocked: current user history remains
  // untouched. Real catalog objects exercise twelve rows and a valid term link.
  if(!expected.length){
    const responses=await Promise.all([api(actor,'/api/v1/data-products?limit=3'),api(actor,'/api/v1/logical-models'),api(actor,'/api/v1/domains'),api(actor,'/api/v1/glossary/terms')]);
    const lists=responses.map((response,index)=>{const body=expectStatus(response,200,'read visual fixture catalog '+index).body;return Array.isArray(body)?body:body.items;});
    visualFixture={categories:['products','models','domains','terms'].map((id,index)=>({id,items:lists[index].slice(0,3).map((object,position)=>({id:object.id,kind:['product','logical','domain','term'][index],title:typeof object.title==='object'?object.title:{de:object.title||object.preferredLabel||object.localizations?.find(item=>item.language==='de')?.preferredLabel||object.id},editedAt:new Date(Date.now()-position*60000).toISOString(),route:index===0?`/products/${object.id}/overview`:index===1?`/models/${object.id}`:index===2?`/domains/${object.id}`:'/domains/terminology',queryParams:index===3?{termId:object.id,ownOffice:'0',view:'cards'}:{}}))}))};
    cdp.mockReadResponses=new Map([['/api/v1/me/recent-work',visualFixture]]);
    await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/me/recent-work'}]},sessionId);
    try{
      await navigate('/',actor,1440,1100);
      await waitFor("document.querySelectorAll('.recent-work li').length===12",'four populated recent-work categories did not render');
      await capturePageSegmentScreenshot('.welcome-workspace','recent-work-twelve-rows-fixture-desktop.png',1440,1100);
    }finally{await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;}
    term=visualFixture.categories[3].items[0];
  }
  if(term){
    await evaluate(`document.querySelector('.recent-category[data-category=terms] [data-work-id="${term.id}"] a').click()`);
    await waitFor(`location.pathname==='/domains/terminology'&&document.querySelectorAll('.term-card').length===1&&document.querySelector('.term-card[data-term-id="${term.id}"]')`,'recent terminology link did not open the exact term card');
  }
  if(visualFixture){cdp.mockReadResponses=new Map([['/api/v1/me/recent-work',visualFixture]]);await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/me/recent-work'}]},sessionId);}
  await navigate('/',actor,390,850);
  await waitFor("document.querySelector('daca-recent-work')&&!document.querySelector('daca-recent-work .recent-state[role=status]')",'mobile recent work did not load');
  invariant(await evaluate("(()=>{const search=document.querySelector('.welcome-search').getBoundingClientRect(),work=document.querySelector('.recent-work').getBoundingClientRect();return work.top>=search.bottom-2&&document.documentElement.scrollWidth<=innerWidth+1;})()"),'recent work causes mobile overflow');
  await capturePageSegmentScreenshot('.welcome-sidebar',visualFixture?'recent-work-twelve-rows-fixture-mobile.png':'recent-work-mobile.png',390,1000);
  if(visualFixture){await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;}
  await navigate('/','fausto.marzo',1440,1000);
  const other=expectStatus(await api('fausto.marzo','/api/v1/me/recent-work'),200,'read switched identity work').body;
  await waitFor("document.querySelector('daca-recent-work')&&!document.querySelector('daca-recent-work .recent-state[role=status]')",'switched identity work did not load');
  invariant(await evaluate("[...document.querySelectorAll('.recent-work li')].map(row=>row.dataset.workId).sort().join(',')")===other.categories.flatMap(group=>group.items.map(item=>item.id)).sort().join(','),'recent works leaked between identities');
  invariant(cdp.runtimeExceptions.length===0,`Recent work browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS recent-work: actor-specific saved edits, three per category, exact links and times, hidden empty groups, term target, right sidebar, mobile and identity switch');
}

async function enableOrganizationDomains() {
  await waitFor("document.querySelector('.org-layer [role=switch]')",'organization domain toggle missing');
  await evaluate("(()=>{const toggle=document.querySelector('.org-layer [role=switch]');if(toggle.getAttribute('aria-checked')==='false')toggle.click();})()");
  await waitFor("document.querySelector('.org-layer [role=switch][aria-checked=true]')",'domain layer did not enable');
}

async function organizationObjectSearchFlow() {
  const actor='kassandra.valdata';
  await navigate('/?organization=vbs',actor,1440,1100);
  await waitFor("document.querySelector('[data-organization-id=\"vbs-armasuisse\"]')&&!document.querySelector('.org-auto-layout').disabled",'data landscape did not load');
  invariant(await evaluate("document.querySelector('.org-layer [role=switch]').getAttribute('aria-checked')==='false'&&!document.querySelector('.org-domain-bubble')"),'data landscape must start with domains hidden');
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'read actor-visible search scopes').body;
  const organization=graph.nodes.find(node=>node.id==='vbs-armasuisse');
  invariant(organization.objectKeys.some(key=>key.startsWith('domain:')),'organization needs its domain objects');
  const context=async(selector)=>{
    await evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});target.scrollIntoView({behavior:'instant',block:'center'});const rect=target.getBoundingClientRect();target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.left+10,clientY:rect.top+10}));})()`);
    await waitFor("document.querySelector('.org-context-menu')",'context menu missing');
  };
  await context('[data-organization-id="vbs-babs"]');
  invariant(await evaluate("document.querySelector('[data-organization-object-search]')?.disabled===true"),'empty organization search is not disabled');
  invariant(await evaluate("document.querySelector('[data-organization-product-search]')?.disabled===true"),'empty product-only action is not disabled');
  await pressKey('Escape','Escape',27);
  await context('[data-organization-id="vbs-armasuisse"]');
  const productHref=await evaluate("document.querySelector('a[data-organization-product-search]').href");
  const productParams=new URL(productHref).searchParams;
  invariant(productParams.get('organization')===organization.id&&productParams.get('kind')==='product'&&!productParams.has('q')&&!productParams.has('status'),'all-products action must pass only organization and product-kind filters');
  invariant(await evaluate("document.querySelector('[data-organization-product-search]').textContent.includes('Alle Datenprodukte der Organisation anzeigen')"),'organization product action wording missing');
  await capturePageSegmentScreenshot('.organization-explorer','organization-products-menu.png',1440,1100);
  await navigate(new URL(productHref).pathname+new URL(productHref).search,actor,1440,1100);
  await waitFor("document.querySelector('.search-chips')&&!document.querySelector('.search-loading')&&document.querySelectorAll('[data-search-key]').length>0",'organization product-only search did not load');
  const productKeys=await evaluate("[...document.querySelectorAll('[data-search-key]')].map(row=>row.dataset.searchKey)");
  invariant(productKeys.every(key=>key.startsWith('product:')&&organization.objectKeys.includes(key)),'product-only search contains other kinds or unrelated products');
  invariant(organization.objectKeys.filter(key=>key.startsWith('product:')).every(key=>productKeys.includes(key)),'product-only action omitted a readable product');
  invariant(await evaluate("document.querySelector('#expert-search-input').value===''"),'all-products action injected a text search');
  await capturePageSegmentScreenshot('.catalog-search','organization-products-results.png',1440,1100);
  await navigate('/?organization=vbs',actor,1440,1100);await context('[data-organization-id="vbs-armasuisse"]');
  const organizationHref=await evaluate("document.querySelector('a[data-organization-object-search]').href");
  invariant(new URL(organizationHref).searchParams.get('organization')===organization.id&&!new URL(organizationHref).searchParams.has('q'),'organization action must pass an exact filter rather than a restrictive name query');
  await capturePageSegmentScreenshot('.welcome-workspace','organization-object-menu.png',1440,1100);
  await navigate(new URL(organizationHref).pathname+new URL(organizationHref).search,actor,1440,1100);
  await waitFor("document.querySelector('.search-chips')&&!document.querySelector('.search-loading')&&document.querySelectorAll('[data-search-key]').length>0",'organization filter-only search did not return objects');
  invariant(await evaluate("document.querySelector('#expert-search-input').value===''"),'scoped search injected free text');
  const resultKeys=await evaluate("[...document.querySelectorAll('[data-search-key]')].map(row=>({key:row.dataset.searchKey,parent:row.closest('[data-search-group]')?.dataset.searchGroup}))");
  invariant(resultKeys.every(row=>organization.objectKeys.includes(row.key)||organization.objectKeys.includes(row.parent)),'organization search contains unrelated objects');
  invariant(resultKeys.some(row=>row.key.startsWith('domain:')),'organization search omitted assigned domains');
  await capturePageSegmentScreenshot('.catalog-search','organization-object-results.png',1440,1100);
  const domain=graph.domains.find(item=>item.label==='Personal');
  invariant(domain?.objectKeys.some(key=>key.startsWith('logical:'))&&domain.objectKeys.some(key=>key.startsWith('term:')),'personnel domain fixture must contain models and terms');
  await navigate('/?organization=vbs',actor,1440,1100);
  await enableOrganizationDomains();
  await waitFor(`document.querySelector('.org-domain-bubble[data-domain-id="${domain.id}"]')`,'domain bubble missing');
  await evaluate(`(()=>{const target=document.querySelector('.org-domain-bubble[data-domain-id="${domain.id}"]');target.scrollIntoView({behavior:'instant',block:'center'});target.focus({preventScroll:true});target.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));})()`);
  await waitFor("document.querySelector('a[data-domain-object-search]')",'keyboard domain context action missing');
  await settleFrames();
  const menuBounds=await evaluate("(()=>{const menu=document.querySelector('.org-context-menu');return {height:menu.clientHeight,content:menu.scrollHeight,max:menu.style.maxHeight,top:menu.getBoundingClientRect().top,viewport:menu.parentElement.getBoundingClientRect().toJSON(),window:innerHeight};})()");
  invariant(menuBounds.height>=menuBounds.content-1,'domain context menu is clipped: '+JSON.stringify(menuBounds));
  const domainHref=await evaluate("document.querySelector('a[data-domain-object-search]').href");
  invariant(new URL(domainHref).searchParams.get('domain')===domain.id&&!new URL(domainHref).searchParams.has('q'),'domain action must pass its stable ID');
  await capturePageSegmentScreenshot('.welcome-workspace','domain-object-menu.png',1440,1100);
  await navigate(new URL(domainHref).pathname+new URL(domainHref).search,actor,1440,1100);
  await waitFor("document.querySelector('.search-chips')&&!document.querySelector('.search-loading')&&document.querySelector('[data-search-kind=organization]')",'domain search did not load');
  for(const kind of ['logical','term','organization'])invariant(await evaluate(`Number(document.querySelector('[data-search-kind=${kind}] b').textContent)>0`),'domain search omitted '+kind);
  invariant(await evaluate(`document.querySelector('.search-sidebar details[open] select').value===${JSON.stringify(domain.id)}`),'domain filter is not visible/selected');
  await capturePageSegmentScreenshot('.catalog-search','domain-object-results.png',1440,1100);
  await evaluate("document.querySelector('[data-search-kind=organization]').click()");
  await waitFor("document.querySelector('.search-row[data-search-key^=\"organization:\"]')",'domain organizations are not searchable');
  const orgKeys=await evaluate("[...document.querySelectorAll('[data-search-key]')].map(row=>row.dataset.searchKey)");
  invariant(orgKeys.every(key=>domain.objectKeys.includes(key)),'domain organization results contain ancestors without direct assignments');
  await evaluate("document.querySelector('.search-chips button').click();document.querySelector('[data-search-kind=domain]').click()");
  await waitFor("document.querySelectorAll('[data-search-key^=\"domain:\"]').length>0",'domain category cannot be searched without free text');
  invariant(cdp.runtimeExceptions.length===0,`object scope search errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS organization-object-search: exact URLs, filter-only organization/domain results, disabled empty scope, domain keyboard menu, organizations/models/terms/products and visible domain filter');
}

async function protectedBuildingsFlow() {
  const actor='sibilla.micheli',id='1aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await navigate('/?organization=vbs',actor,1440,1100);
  const product=expectStatus(await api(actor,`/api/v1/data-products/${id}`),200,'read image-seeded protected buildings product').body;
  invariant(product.lifecycle==='active'&&product.ownerUserId==='giuseppe.starwars','armasuisse building product is not active or has the wrong Data Owner');
  const demand=expectStatus(await api(actor,'/api/v1/data-products/1bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),200,'read image-seeded reverse building demand product').body;
  invariant(demand.lifecycle==='active'&&demand.ownerUserId==='lawrence.hill','Verteidigung building demand has the wrong Data Owner or lifecycle');
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'read protected buildings catalog flow').body;
  const edge=graph.relations.find(edge=>edge.sourceId==='vbs-armasuisse'&&edge.targetId==='vbs-verteidigung');
  invariant(edge?.count===1&&!edge.inferred,'armasuisse must supply one product to Verteidigung');
  const reverse=graph.relations.find(edge=>edge.sourceId==='vbs-verteidigung'&&edge.targetId==='vbs-armasuisse');
  invariant(reverse?.count===1&&!reverse.inferred,'Verteidigung must supply one reverse product to armasuisse');
  const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
  invariant(nodes['vbs-armasuisse'].productCount>=1&&nodes['vbs-verteidigung'].consumedProductCount>=1,'producer/consumer counts missing');
  const selector='.org-connection[data-source-id="vbs-armasuisse"][data-target-id="vbs-verteidigung"]';
  const reverseSelector='.org-connection[data-source-id="vbs-verteidigung"][data-target-id="vbs-armasuisse"]';
  await waitFor(`document.querySelector(${JSON.stringify(selector)})?.querySelectorAll('.org-packet').length===1`,'building flow is not visible inside VBS');
  invariant(await evaluate("!document.querySelector('.org-office[data-organization-id=\"vbs-armasuisse\"]').classList.contains('is-empty')&&!document.querySelector('.org-office[data-organization-id=\"vbs-verteidigung\"]').classList.contains('is-empty')"),'supplying/consuming offices remain grey');
  await evaluate("document.querySelector('.org-fullscreen').click()");
  await waitFor("document.querySelector('.organization-explorer.is-fullscreen')",'VBS buildings fullscreen did not open');await settleFrames();
  const lanes=await evaluate(`(${JSON.stringify([selector,reverseSelector])}).map(selector=>{const connection=document.querySelector(selector),line=connection.querySelector('.org-thread-hit'),start=line.getPointAtLength(0),end=line.getPointAtLength(line.getTotalLength()),flow=getComputedStyle(connection.querySelector('.org-flow')),dot=connection.querySelector('.org-packet'),animation=dot.getAnimations()[0];animation.pause();animation.currentTime=1200;const a=dot.querySelector('.org-packet-core').getBoundingClientRect();animation.currentTime=1800;const b=dot.querySelector('.org-packet-core').getBoundingClientRect();return{x1:start.x,y1:start.y,x2:end.x,y2:end.y,dx:b.x-a.x,dy:b.y-a.y,fromX:parseFloat(flow.getPropertyValue('--flow-from-x')),fromY:parseFloat(flow.getPropertyValue('--flow-from-y')),toX:parseFloat(flow.getPropertyValue('--flow-to-x')),toY:parseFloat(flow.getPropertyValue('--flow-to-y')),points:connection.querySelectorAll('.org-packet').length};})`);
  invariant(lanes.every(lane=>lane.points===1&&lane.dx*(lane.x2-lane.x1)+lane.dy*(lane.y2-lane.y1)>0),'real reciprocal packets do not travel from each producer towards its consumer');
  invariant(Math.hypot(lanes[0].x1-lanes[1].x2,lanes[0].y1-lanes[1].y2)<1&&Math.hypot(lanes[0].x2-lanes[1].x1,lanes[0].y2-lanes[1].y1)<1,'reciprocal products are not on the same organization connection');
  invariant(Math.hypot(lanes[0].fromX-lanes[1].toX,lanes[0].fromY-lanes[1].toY)>4,'reciprocal particles overlap instead of occupying separate lanes');
  invariant(await evaluate(`(${JSON.stringify([selector,reverseSelector])}).every(selector=>{const r=document.querySelector(selector).querySelector('.org-packet-core').getBoundingClientRect(),target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return target&&!target.closest('.org-office,.org-satellite,.org-focus');})`),'reciprocal points are hidden behind overlapping organization cards');
  await captureScreenshot('armasuisse-verteidigung-buildings-fullscreen.png');
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).querySelector('.org-thread-hit').focus()`);
  await waitFor("document.querySelector('.daca-glossary-tooltip.is-visible')?.textContent.includes('1 konsumiertes Datenprodukt')",'building flow tooltip does not explain the supplied product');
  await captureScreenshot('armasuisse-verteidigung-buildings-tooltip.png');
  await pressKey('Escape','Escape',27);
  invariant(cdp.runtimeExceptions.length===0,`protected building flow runtime errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS protected-buildings: two image-seeded products, existing owners, real reciprocal one-point flows on the same connection, opposing travel, separate particle lanes, counts, fullscreen and shared tooltip');
}

async function organizationHeadingSpaceFlow() {
  const actor='kassandra.valdata',viewPath='/api/v1/organization-network/view';
  await navigate('/?organization=efd',actor,1440,1100);
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'read heading-space graph').body;
  const fixture={...graph,nodes:graph.nodes.filter(node=>['efd','efd-epa'].includes(node.id)),satelliteIds:[],domains:[],relations:[]};
  let stored={revision:0,configuration:{schemaVersion:1,scopes:{}}},saves=0;
  cdp.mockReadResponses=new Map([['/api/v1/organization-network',fixture],[viewPath,request=>{
    if(request.method==='PUT'){const body=JSON.parse(request.postData);invariant(body.revision===stored.revision,'wrong layout revision');stored={revision:stored.revision+1,configuration:body.configuration};saves++;}
    return stored;
  }]]);
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/organization-network*'}]},sessionId);
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  const dragBelowHeading=async(label)=>{
    const hadAnchor=!!stored.configuration.scopes.efd;
    await evaluate("document.querySelector('.org-auto-layout').click()");
    if(hadAnchor)await waitFor("!document.querySelector('.org-save-layout').disabled",'automatic layout did not release the previous test anchor');
    await settleFrames();
    await evaluate("document.querySelector('.org-stage').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
    const points=await evaluate(`(()=>{const stage=document.querySelector('.org-stage').getBoundingClientRect(),heading=document.querySelector('.org-focus').getBoundingClientRect(),card=document.querySelector('.org-office[data-organization-id="efd-epa"]').getBoundingClientRect();const worldY=(heading.bottom-stage.top)/stage.height*650+62;return{from:{x:card.left+card.width/2,y:card.top+card.height/2},to:{x:stage.left+stage.width/2,y:stage.top+stage.height*worldY/650},worldY};})()`);
    invariant(points.worldY<328,'heading fixture does not exercise the formerly blocked strip: '+JSON.stringify(points));
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.from},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=8;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.from.x+(points.to.x-points.from.x)*step/8,y:points.from.y+(points.to.y-points.from.y)*step/8,button:'left',buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1},sessionId);await settleFrames();
    const actual=await evaluate(`(()=>{const stage=document.querySelector('.org-stage').getBoundingClientRect(),heading=document.querySelector('.org-focus').getBoundingClientRect(),card=document.querySelector('.org-office[data-organization-id="efd-epa"]').getBoundingClientRect();return{x:card.left+card.width/2,y:card.top+card.height/2,clearance:card.top-heading.bottom,worldY:(card.top+card.height/2-stage.top)/stage.height*650};})()`);
    invariant(Math.hypot(actual.x-points.to.x,actual.y-points.to.y)<3&&actual.clearance>8,'card cannot occupy the newly freed space in '+label+': '+JSON.stringify({points,actual}));
    await evaluate("document.querySelector('.org-save-layout').click()");
    await waitFor("document.querySelector('.org-save-layout').disabled&&!document.querySelector('.org-layout-toolbar[aria-busy=true]')",'heading-space layout did not save');
    invariant(Math.abs(stored.configuration.scopes.efd.offices['efd-epa'].y-(actual.worldY-240))<2,'saved anchor was rebased in '+label);
    await capturePageSegmentScreenshot('.organization-explorer',`heading-space-${label}.png`,1440,1100);
  };
  try{
    await navigate('/?organization=efd',actor,1440,1100);
    for(const language of ['de','fr','it','rm','en']){
      if(await evaluate(`document.documentElement.lang!==${JSON.stringify(language)}`)){
        await evaluate(`(()=>{const select=document.querySelector('.daca-header-language select');select.value=${JSON.stringify(language)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await waitFor("document.querySelector('.daca-preference-dialog')",'language choice missing');
        await evaluate("document.querySelectorAll('.daca-preference-dialog footer button')[1].click()");
        await waitFor("!document.querySelector('.daca-preference-dialog')",'device-language choice did not close');
      }
      await dragBelowHeading(language);
    }
    const anchor=structuredClone(stored.configuration.scopes.efd.offices['efd-epa']);
    await navigate('/?organization=efd',actor,1440,1100);
    await waitFor("document.querySelector('.org-office[data-organization-id=\"efd-epa\"]')&&!document.querySelector('.org-auto-layout').disabled",'saved card did not reload');
    invariant(JSON.stringify(stored.configuration.scopes.efd.offices['efd-epa'])===JSON.stringify(anchor),'reload changed saved anchors');
    const restored=await evaluate("(()=>{const stage=document.querySelector('.org-stage').getBoundingClientRect(),card=document.querySelector('.org-office[data-organization-id=\"efd-epa\"]').getBoundingClientRect();return{x:(card.left+card.width/2-stage.left)/stage.width*960,y:(card.top+card.height/2-stage.top)/stage.height*650};})()");
    invariant(Math.abs(restored.x-anchor.x-202)<2&&Math.abs(restored.y-anchor.y-240)<2,'reloaded card moved out of its saved coordinates');
    await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();
    await dragBelowHeading('fullscreen');
    await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();
    invariant(saves>0&&cdp.runtimeExceptions.length===0,'heading-space save or runtime failure: '+JSON.stringify({saves,errors:cdp.runtimeExceptions}));
    console.log('PASS organization-heading-space: real drag directly below measured title in DE/FR/IT/RM/EN and fullscreen, title clearance, save/reload with stable coordinates, no real profile/catalog writes');
  }finally{await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;await cdp.call('Emulation.setEmulatedMedia',{features:[]},sessionId);}
}

async function organizationHighwayFlow() {
  await organizationFlowFlow();
  const actor='kassandra.valdata';
  await navigate('/?organization=efd',actor,1440,1100);
  await waitFor("document.querySelector('.org-highway-band')",'luminous data-highway ribbon missing');
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'read highway comparison graph').body;
  const sg=graph.nodes.find(node=>node.kind==='cantonal'&&node.label.includes('St. Gallen'));
  const ne=graph.nodes.find(node=>node.kind==='cantonal'&&node.label.includes('Neuch'));
  invariant(sg&&ne,'canton cards missing for visual comparison');
  const keep=new Set(['efd','efd-estv','efd-efv',sg.id,ne.id]);
  // Read-only fixture: fixed card anchors make the selected connection treatment
  // comparable to the mockup, without saving a new personal layout or catalog record.
  const fixture={...graph,nodes:graph.nodes.filter(node=>keep.has(node.id)),satelliteIds:[sg.id,ne.id],domains:[],relations:graph.relations.filter(edge=>keep.has(edge.sourceId)&&keep.has(edge.targetId))};
  const view={revision:1,configuration:{schemaVersion:1,scopes:{efd:{offices:{'efd-estv':{x:398,y:40},'efd-efv':{x:488,y:230}},satellites:{[sg.id]:{x:80,y:200},[ne.id]:{x:80,y:390}}}}}};
  cdp.mockReadResponses=new Map([['/api/v1/organization-network',fixture],['/api/v1/organization-network/view',view]]);
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/organization-network*'}]},sessionId);
  try{
    await navigate('/?organization=efd',actor,1440,1100);
    await waitFor("document.querySelectorAll('.org-highway-band').length===3",'comparison highways did not load');
    const ribbon=await evaluate(`(()=>{const band=document.querySelector('.org-highway-band'),spine=document.querySelector('.org-thread'),packet=document.querySelector('.org-packet');return{width:parseFloat(getComputedStyle(band).strokeWidth),opacity:parseFloat(getComputedStyle(band).opacity),curve:spine.getAttribute('d'),path:getComputedStyle(packet).offsetPath,markers:document.querySelectorAll('.org-geometry marker').length};})()`);
    invariant(ribbon.width>=10&&ribbon.width<=14&&ribbon.opacity>.5&&ribbon.curve.includes(' C ')&&ribbon.path.startsWith('path(')&&ribbon.markers===0,'highway differs from selected ribbon treatment: '+JSON.stringify(ribbon));
    await evaluate("document.querySelector('.org-stage').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
    const finish=await evaluate(`(()=>{const bands=[...document.querySelectorAll('.org-highway-band')],probe=document.createElement('span');probe.style.color='var(--daca-blue-soft)';document.body.append(probe);const tint=getComputedStyle(probe).color;probe.remove();return{tinted:getComputedStyle(document.querySelector('.org-bubble')).fill===tint,bands:bands.map(band=>{const connection=band.parentElement,matrix=band.getScreenCTM(),a=band.getPointAtLength(0).matrixTransform(matrix),b=band.getPointAtLength(band.getTotalLength()).matrixTransform(matrix),under=p=>document.elementFromPoint(p.x,p.y)?.closest('[data-organization-id]')?.dataset.organizationId;return{source:under(a)===connection.dataset.sourceId,target:under(b)===connection.dataset.targetId,cap:getComputedStyle(band).strokeLinecap,gradient:getComputedStyle(band).stroke.includes('url(')};}),tails:[...document.querySelectorAll('.org-packet-tail')].map(tail=>({width:tail.getBBox().width,gradient:getComputedStyle(tail).fill.includes('url(')}))};})()`);
    invariant(finish.tinted&&finish.bands.every(band=>band.source&&band.target&&band.cap==='butt'&&band.gradient)&&finish.tails.every(tail=>tail.width>=25&&tail.gradient),'highway tint, hidden endpoints, gradient or tapered tails missing: '+JSON.stringify(finish));
    const samples=await evaluate(`(()=>[...document.querySelectorAll('.org-connection')].map(connection=>{const path=connection.querySelector('.org-highway-band'),packets=[...connection.querySelectorAll('.org-packet')],matrix=path.getScreenCTM(),length=path.getTotalLength();return packets.map(packet=>{const animation=packet.getAnimations().find(a=>a.animationName?.includes('daca-packet-travel'));animation.pause();animation.currentTime=1500;const rect=packet.querySelector('.org-packet-core').getBoundingClientRect(),center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};let distance=Infinity;for(let i=0;i<=200;i++){const p=path.getPointAtLength(length*i/200).matrixTransform(matrix);distance=Math.min(distance,Math.hypot(p.x-center.x,p.y-center.y));}return{distance,center,duration:animation.effect.getTiming().duration};});}))()`);
    invariant(samples.flat().every(sample=>sample.duration===3000&&sample.distance<3),'packets leave their curved lane: '+JSON.stringify(samples));
    invariant(samples.filter(pair=>pair.length===2).every(pair=>Math.hypot(pair[0].center.x-pair[1].center.x,pair[0].center.y-pair[1].center.y)>28),'two products overlap in the highway');
    await evaluate("document.querySelectorAll('.org-office,.org-satellite').forEach(card=>card.getAnimations().forEach(a=>{a.pause();a.currentTime=0;}))");
    await capturePageSegmentScreenshot('.organization-explorer','highway-normal.png',1440,1100);
    if(screenshotDirectory){
      const clip=await evaluate("(()=>{const r=document.querySelector('.org-stage').getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()");
      const shot=await cdp.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip},sessionId);
      await writeFile(path.join(path.resolve(screenshotDirectory),'highway-comparison-canvas.png'),Buffer.from(shot.data,'base64'));
    }
    const packetOcclusion=await evaluate("(()=>[...document.querySelectorAll('.org-connection')].flatMap(connection=>[...connection.querySelectorAll('.org-packet')].flatMap(packet=>{const animation=packet.getAnimations().find(a=>a.animationName?.includes('daca-packet-travel'));animation.pause();return[.001,.999].map(phase=>{const timing=animation.effect.getTiming();animation.currentTime=timing.delay+timing.duration*phase;const r=packet.querySelector('.org-packet-core').getBoundingClientRect(),actual=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[data-organization-id]')?.dataset.organizationId;const expected=phase<.5?connection.dataset.sourceId:connection.dataset.targetId,covered=[[0,0],[-8,-8],[8,-8],[-8,8],[8,8]].every(([x,y])=>document.elementFromPoint(r.left+r.width/2+x,r.top+r.height/2+y)?.closest('[data-organization-id]')?.dataset.organizationId===expected);return{phase,actual,expected,covered};});})))()");
    invariant(packetOcclusion.every(sample=>sample.actual===sample.expected&&sample.covered),'Organization packets vanish before the card: '+JSON.stringify(packetOcclusion));
    await capturePageSegmentScreenshot('.organization-explorer','highway-packets-under-boxes.png',1440,1100);
    // Offset the cards so the chord meets a lower/upper card edge while the
    // main curve turns horizontally: this previously exposed hard stub joins.
    view.configuration.scopes.efd.offices['efd-estv']={x:118,y:70};
    view.configuration.scopes.efd.satellites[sg.id]={x:80,y:140};
    await navigate('/?organization=efd',actor,1440,1100);
    await waitFor("document.querySelectorAll('.org-highway-band').length===3",'offset-card highway case did not load');
    invariant(await evaluate("[...document.querySelectorAll('.org-highway-band')].every(band=>!band.getAttribute('d').includes(' L ')&&(band.getAttribute('d').match(/ C /g)??[]).length===1)"),'hard straight-to-curve joints remain in offset-card ribbons');
    await evaluate("document.querySelectorAll('.org-office,.org-satellite,.org-packet').forEach(element=>element.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=1500;}))");
    await capturePageSegmentScreenshot('.organization-explorer','highway-offset-cards.png',1440,1100);
    await evaluate("document.documentElement.setAttribute('data-daca-theme','dark')");await capturePageSegmentScreenshot('.organization-explorer','highway-dark.png',1440,1100);
    await evaluate("document.documentElement.setAttribute('data-daca-theme','light')");
    await setViewport(390,844);await settleFrames();
    invariant(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'highways overflow mobile page');
    await capturePageSegmentScreenshot('.organization-explorer','highway-mobile.png',390,844);
    invariant(cdp.runtimeExceptions.length===0,'highway browser errors: '+JSON.stringify(cdp.runtimeExceptions));
    console.log('PASS organization-highway: pale-blue focus area, gradient ribbons ending under cards, tapered tails, curve-following packets, readable two-packet trains, three-second transit, desktop/dark/mobile and read-only visual comparison');
  }finally{await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;}
}

async function organizationFlowFlow() {
  const actor='kassandra.valdata';
  await navigate('/?organization=efd',actor,1440,1100);
  await waitFor("document.querySelector('.org-packet')&&!document.querySelector('.org-auto-layout').disabled",'data-flow packets did not load');
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'read real directed catalog relationships').body;
  invariant(await evaluate(`(()=>{const edges=${JSON.stringify(graph.relations)};return [...document.querySelectorAll('.org-connection')].every(line=>edges.some(edge=>edge.sourceId===line.dataset.sourceId&&edge.targetId===line.dataset.targetId));})()`),'rendered flow direction differs from API');
  const sg=graph.nodes.find(node=>node.label==='Kanton St. Gallen');
  const sgEdge=graph.relations.find(edge=>edge.sourceId==='efd-estv'&&edge.targetId===sg?.id);
  invariant(sgEdge?.count===2&&sg.consumedProductCount===2,'real St. Gallen example does not consume two distinct ESTV products');
  const realSelector=`.org-connection[data-source-id="efd-estv"][data-target-id="${sg.id}"]`;
  invariant(await evaluate(`document.querySelector(${JSON.stringify(realSelector)}).querySelectorAll('.org-packet').length===2&&!document.querySelector('.org-flow-direction')`),'real ESTV → St. Gallen connection does not show exactly two points without arrows');
  const timing=await evaluate(`(async()=>{const dot=document.querySelector(${JSON.stringify(realSelector)}).querySelector('.org-packet'),animation=dot.getAnimations().find(item=>item.animationName?.includes('daca-packet-travel'));if(!animation)return null;await new Promise(resolve=>requestAnimationFrame(resolve));const start=animation.currentTime,wall=performance.now();await new Promise(resolve=>setTimeout(()=>requestAnimationFrame(resolve),700));return{duration:animation.effect.getTiming().duration,rate:animation.playbackRate,state:animation.playState,elapsed:animation.currentTime-start,wall:performance.now()-wall,css:getComputedStyle(dot).animationDuration};})()`);
  invariant(timing?.duration===3000&&timing.css==='3s'&&timing.rate===1&&timing.state==='running','live organization transit must be exactly three seconds: '+JSON.stringify(timing));
  invariant(timing.elapsed/timing.wall>.85&&timing.elapsed/timing.wall<1.15,'live browser animation is slower than wall time: '+JSON.stringify(timing));
  console.log('PASS three-second live transit: '+JSON.stringify(timing));
  // Freeze a mid-flight frame for inspectable evidence of the real two-point train.
  await evaluate(`document.querySelector(${JSON.stringify(realSelector)}).querySelectorAll('.org-packet').forEach(dot=>{const animation=dot.getAnimations()[0];animation.pause();animation.currentTime=2600;})`);
  await capturePageSegmentScreenshot('.organization-explorer','catalog-flows.png',1440,1100);
  // Reciprocal/high-density cases are browser-only fixtures; never fabricate
  // consumption or access history in the authoritative catalog.
  const fixture=structuredClone(graph),edge=fixture.relations.find(item=>item.sourceId==='efd-estv');
  invariant(edge,'ESTV producer fixture missing');
  fixture.relations=[{...edge,count:2},{...edge,sourceId:edge.targetId,targetId:edge.sourceId,count:1}];
  cdp.mockReadResponses=new Map([['/api/v1/organization-network',fixture],['/api/v1/organization-network/view',{revision:0,configuration:{schemaVersion:1,scopes:{}}}]]);
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/organization-network*'}]},sessionId);
  try {
    await navigate('/?organization=efd',actor,1440,1100);
    await waitFor("document.querySelectorAll('.org-connection').length===2",'reciprocal flow fixture did not load');
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sessionId);
    await evaluate("document.querySelector('.org-fullscreen').click()");
    await waitFor("document.querySelector('.organization-explorer.is-fullscreen')&&document.activeElement?.classList.contains('org-fullscreen')",'flow fullscreen missing');await settleFrames();
    const state=await evaluate(`(()=>{const lines=[...document.querySelectorAll('.org-connection')];return lines.map(line=>{const flow=line.querySelector('.org-flow'),style=getComputedStyle(flow);return{count:line.querySelectorAll('.org-packet').length,startX:parseFloat(style.getPropertyValue('--flow-from-x')),startY:parseFloat(style.getPropertyValue('--flow-from-y')),endX:parseFloat(style.getPropertyValue('--flow-to-x')),endY:parseFloat(style.getPropertyValue('--flow-to-y'))};});})()`);
    invariant(state[0].count===2&&state[1].count===1,'one product must have one point and two products exactly two points');
    invariant(await evaluate("(()=>{const flows=[...document.querySelectorAll('.org-flow')];return getComputedStyle(flows[0]).getPropertyValue('--flow-duration')===getComputedStyle(flows[1]).getPropertyValue('--flow-duration');})()"),'product count changed stream speed');
    invariant(await evaluate("(()=>{const dots=[...document.querySelector('.org-connection').querySelectorAll('.org-packet')];return Math.abs(parseFloat(dots[0].style.animationDelay)-parseFloat(dots[1].style.animationDelay))<=1.5;})()"),'two products are not a successive point train');
    invariant(await evaluate("!document.querySelector('.org-flow-direction')&&!document.querySelector('.org-geometry marker')"),'organization connections still contain arrowheads');
    invariant((state[0].endX-state[0].startX)*(state[1].endX-state[1].startX)+(state[0].endY-state[0].startY)*(state[1].endY-state[1].startY)<0,'reciprocal packet lanes point in the same direction');
    invariant(Math.hypot(state[0].startX-state[1].endX,state[0].startY-state[1].endY)>4,'reciprocal streams overlap');
    invariant(await evaluate("!document.querySelector('.org-domain-thread .org-packet')"),'domain assignment carries consumption packets');
    for(let index=0;index<2;index++){
      const motion=await evaluate(`(()=>{const g=document.querySelectorAll('.org-connection')[${index}].querySelector('.org-packet'),animation=g.getAnimations()[0],duration=animation.effect.getTiming().duration;animation.pause();animation.currentTime=duration*.2;const a=g.querySelector('.org-packet-core').getBoundingClientRect();animation.currentTime=duration*.4;const b=g.querySelector('.org-packet-core').getBoundingClientRect();animation.play();return{dx:b.x-a.x,dy:b.y-a.y};})()`);
      invariant(motion.dx*(state[index].endX-state[index].startX)+motion.dy*(state[index].endY-state[index].startY)>0,'packet does not travel from producer towards consumer');
    }
    const transform=await evaluate("getComputedStyle(document.querySelector('.org-packet')).offsetDistance");await sleep(330);
    invariant(await evaluate(`getComputedStyle(document.querySelector('.org-packet')).offsetDistance!==${JSON.stringify(transform)}`),'packets do not animate naturally');
    const pulse=await evaluate("(()=>{const halo=document.querySelector('.org-packet-halo'),a=halo.getAnimations()[0];a.pause();a.currentTime=0;const low=getComputedStyle(halo).opacity;a.currentTime=700;const high=getComputedStyle(halo).opacity;a.play();return{low,high};})()");
    invariant(Number(pulse.high)>Number(pulse.low)*2,'electron halo does not pulse strongly');
    const hover=await evaluate("(()=>{for(const hit of [...document.querySelectorAll('.org-thread-hit')].reverse()){const m=hit.getScreenCTM();for(const t of [.5,.3,.7,.2,.8]){const p=hit.getPointAtLength(hit.getTotalLength()*t).matrixTransform(m);if(document.elementFromPoint(p.x,p.y)===hit)return{x:p.x,y:p.y};}}return null;})()");
    invariant(hover,'connection hit area is blocked by the office field');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:hover.x,y:hover.y},sessionId);
    await waitFor("document.querySelector('.daca-glossary-tooltip.is-visible[role=tooltip]')?.textContent.includes('Ein Punkt steht für ein konsumiertes Datenprodukt')",'shared connection product-count tooltip missing');
    invariant(await evaluate("document.querySelector('.daca-glossary-tooltip.is-visible').textContent.includes('nicht auf Live-Abrufen')"),'product-count tooltip misrepresents real traffic');
    await captureScreenshot('reciprocal-electrons-tooltip-fullscreen.png');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10},sessionId);
    await evaluate("document.querySelector('.org-thread-hit').focus()");
    await waitFor("document.querySelector('.daca-glossary-tooltip.is-visible[role=tooltip]')",'keyboard connection tooltip missing');
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    invariant(await evaluate("getComputedStyle(document.querySelector('.org-flow')).display!=='none'&&getComputedStyle(document.querySelector('.org-packet')).animationName==='none'&&!document.querySelector('.org-flow-direction')&&document.querySelector('.org-connection').querySelectorAll('.org-packet').length===2"),'reduced motion must retain two static points without arrows');
    const still=await evaluate("getComputedStyle(document.querySelector('.org-packet')).offsetDistance");await sleep(250);
    invariant(await evaluate(`getComputedStyle(document.querySelector('.org-packet')).offsetDistance===${JSON.stringify(still)}`),'reduced motion points keep travelling');
    await captureScreenshot('flow-reduced-motion.png');
    await pressKey('Escape','Escape',27);
    invariant(await evaluate("!document.querySelector('.organization-explorer.is-fullscreen')"),'flow fullscreen cannot exit');
    invariant(cdp.runtimeExceptions.length===0,`flow runtime errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS organization-flow: real second ESTV → St. Gallen product, exact one/two point trains, equal speed, no arrows, reciprocal lanes, motion/pulses, shared tooltip, fullscreen and static reduced motion');
  } finally {
    await cdp.call('Fetch.disable',{},sessionId);cdp.mockReadResponses=null;
    await cdp.call('Emulation.setEmulatedMedia',{features:[]},sessionId);
  }
}

async function organizationLocalizationFlow() {
  const actor='kassandra.valdata',key=`daca.preference.${actor}.language`;
  await navigate('/?organization=uvek-astra',actor,1440,1000);
  await waitFor("document.querySelector('.org-focus-title')&&!document.querySelector('.org-auto-layout').disabled",'ASTRA landscape did not load');
  const previous=await evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
  const profile=expectStatus(await api(actor,'/api/v1/me/preferences/language'),200,'read profile language').body;
  const layout=expectStatus(await api(actor,'/api/v1/organization-network/view'),200,'read unchanged organization anchors').body;
  const reads=await evaluate("performance.getEntriesByType('resource').filter(item=>new URL(item.name).pathname==='/api/v1/organization-network').length");
  try {
    for(const [language,code,label] of [['fr','OFROU','Office fédéral des routes'],['it','USTRA','Ufficio federale delle strade'],['rm','UVIAS','Uffizi federal da vias'],['en','FEDRO','Federal Roads Office'],['de','ASTRA','Bundesamt für Strassen']]){
      if(await evaluate(`document.querySelector('.daca-header-language select').value!==${JSON.stringify(language)}`)){
        await evaluate(`(()=>{const select=document.querySelector('.daca-header-language select');select.value=${JSON.stringify(language)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await waitFor("document.querySelector('.daca-preference-dialog')",'language storage choice missing');
        await evaluate("document.querySelectorAll('.daca-preference-dialog footer button')[1].click()");
      }
      await waitFor(`document.documentElement.lang===${JSON.stringify(language)}&&document.querySelector('.org-focus-title')?.textContent.trim()===${JSON.stringify(code)}&&document.querySelector('.org-focus')?.textContent.includes(${JSON.stringify(label)})`,'localized ASTRA title/name missing: '+language);
      invariant(await evaluate("document.querySelector('.org-breadcrumb button[aria-current]')?.textContent.trim()==="+JSON.stringify(code)), 'localized breadcrumb missing: '+language);
      if(language==='fr'){
        invariant(await evaluate("document.querySelector('.org-breadcrumb').textContent.includes('DETEC')&&!document.querySelector('.organization-explorer').textContent.includes('Bundesamt für Strassen')"),'French landscape still contains German organization names');
        await capturePageSegmentScreenshot('.organization-explorer','organization-astra-french.png',1440,1000);
        await evaluate("document.querySelector('.org-focus').focus()");
        await waitFor("[...document.querySelectorAll('.daca-glossary-tooltip')].some(item=>item.textContent.includes('Office fédéral des routes'))",'French organization tooltip missing');
        await pressKey('Escape','Escape',27);
        await evaluate("document.querySelector('.org-fullscreen').click()");
        await waitFor("document.querySelector('.organization-explorer.is-fullscreen .org-focus')?.textContent.includes('Office fédéral des routes')",'French fullscreen organization name missing');
        await capturePageSegmentScreenshot('.organization-explorer','organization-astra-french-fullscreen.png',1440,1000);
        await pressKey('Escape','Escape',27);
      }
    }
    invariant(await evaluate("performance.getEntriesByType('resource').filter(item=>new URL(item.name).pathname==='/api/v1/organization-network').length")===reads,'language switching fetched the organization network again');
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/organization-network/view'),200,'verify preserved organization layout').body)===JSON.stringify(layout),'language switching changed saved organization anchors');
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/me/preferences/language'),200,'verify profile language unchanged').body)===JSON.stringify(profile),'browser-only language change altered the profile');
    invariant(cdp.runtimeExceptions.length===0,`Organization localization errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    await evaluate("(()=>{const select=document.querySelector('.daca-header-language select');select.value='rm';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitFor("document.querySelector('.daca-preference-dialog')",'Romansh storage choice missing');
    invariant(await evaluate("document.querySelector('.daca-preference-dialog h2').textContent==='Memorisar la lingua'"),'Romansh storage dialog untranslated');
    await evaluate("document.querySelectorAll('.daca-preference-dialog footer button')[2].click()");
    await waitFor("!document.querySelector('.daca-preference-dialog')",'Romansh profile save did not finish');
    invariant(expectStatus(await api(actor,'/api/v1/me/preferences/language'),200,'read Romansh profile preference').body.value==='rm','Romansh profile preference missing');
    invariant(await evaluate(`localStorage.getItem(${JSON.stringify(key)})===null`),'profile save retained a browser language override');
    await navigate('/settings/language-personal',actor,1440,1000);
    await waitFor("document.documentElement.lang==='rm'&&document.querySelector('.settings-language-field select')?.value==='rm'",'Romansh profile did not survive navigation/reload');
    invariant(await evaluate("document.querySelector('.settings-panel h2').textContent==='Parameters da lingua persunals'"),'Romansh settings text missing');
    invariant(await evaluate("document.title.includes('Parameters da lingua')"),'Romansh page title missing');
    await capturePageSegmentScreenshot('.settings-layout','language-romansh-settings.png',1440,1000);
    await navigate('/?organization=efd-efv',actor,1440,1100);
    await waitFor("document.documentElement.lang==='rm'&&document.querySelector('.org-focus-counts')?.textContent.includes('1 product da datas purschì')",'Romansh singular offering missing after profile restore');
    invariant(await evaluate("document.querySelector('.org-breadcrumb').textContent.includes('Survista generala')"),'Romansh overview breadcrumb missing');
    invariant(await evaluate("document.querySelector('.org-no-children').getBoundingClientRect().top>=document.querySelector('.org-viewport').getBoundingClientRect().bottom"),'empty-unit notice overlaps localized heading/counts');
    await capturePageSegmentScreenshot('.organization-explorer','organization-romansh-counts.png',1440,1100);
    await setViewport(390,900); await settleFrames();
    invariant(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'Romansh causes page overflow on mobile');
    await evaluate("document.querySelector('.org-fullscreen').click()");
    await waitFor("document.querySelector('.organization-explorer.is-fullscreen')",'Romansh fullscreen missing');
    invariant(await evaluate("document.querySelector('.org-fullscreen').textContent.includes('Bandunar il maletg entir')"),'Romansh fullscreen exit untranslated');
    await pressKey('Escape','Escape',27);
    await waitFor("!document.querySelector('.organization-explorer.is-fullscreen')",'Romansh fullscreen did not exit');
    await capturePageSegmentScreenshot('.welcome-workspace','organization-romansh-mobile.png',390,900);
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/organization-network/view'),200,'verify unchanged anchors after Romansh restore').body)===JSON.stringify(layout),'Romansh changed saved organization anchors');
    invariant(cdp.runtimeExceptions.length===0,`Romansh runtime errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS organization-localization: DE/FR/IT/RM/EN, UVIAS, localized counts and settings, profile save/restore, unchanged graph and anchors');
  } finally {
    await evaluate(previous===null?`localStorage.removeItem(${JSON.stringify(key)})`:`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(previous)})`);
    expectStatus(await api(actor,'/api/v1/me/preferences/language',{method:'PUT',body:profile}),200,'restore original profile language');
  }
}

async function organizationDomainLayoutFlow() {
  const actor='kassandra.valdata',path='/api/v1/organization-network/view';
  await navigate('/?organization=vbs',actor,1440,1100);
  const baseline=expectStatus(await api(actor,path),200,'read original personal anchors').body;
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'read unchanged domain assignments').body;
  const domain=graph.domains.find(item=>item.label==='Personal'),key='domain:'+domain.id;
  const bubble=`.org-domain-bubble[data-domain-id="${domain.id}"]`;
  try {
    const configuration=structuredClone(baseline.configuration);
    configuration.scopes.vbs={offices:{...(configuration.scopes.vbs?.offices??{}),'vbs-verteidigung':{x:100,y:160},[key]:{x:440,y:160}},satellites:configuration.scopes.vbs?.satellites??{}};
    expectStatus(await api(actor,path,{method:'PUT',body:{revision:baseline.revision,configuration}}),200,'prepare independent domain and organization anchors');
    await navigate('/?organization=vbs',actor,1440,1100);
    await enableOrganizationDomains();
    await waitFor(`document.querySelector('${bubble}')&&!document.querySelector('.org-auto-layout').disabled`,'domain anchors did not load');
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await evaluate("document.querySelector('.org-fullscreen').click()");
    await waitFor("document.activeElement===document.querySelector('.org-fullscreen')",'domain fullscreen did not settle focus');await settleFrames();
    await captureScreenshot('domain-position-before-drag.png');
    const hit=await evaluate(`(()=>{const target=document.querySelector('${bubble}'),rect=target.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;return {x,y,target:document.elementFromPoint(x,y)?.outerHTML.slice(0,500),left:target.style.left,top:target.style.top};})()`);
    invariant(await evaluate(`document.elementFromPoint(${hit.x},${hit.y})?.closest('${bubble}')!==null`),'domain pointer target is obscured: '+JSON.stringify(hit));
    const before=await evaluate(`(()=>{const target=document.querySelector('${bubble}'),r=target.getBoundingClientRect(),org=document.querySelector('[data-organization-id="vbs-verteidigung"]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,dx:(org.left+org.width/2-r.left-r.width/2)*.3,dy:(org.top+org.height/2-r.top-r.height/2)*.3,distance:Math.hypot(org.left+org.width/2-r.left-r.width/2,org.top+org.height/2-r.top-r.height/2),left:target.style.left,top:target.style.top};})()`);
    const targetsBefore=(await cdp.call('Target.getTargets')).targetInfos.filter(target=>target.type==='page').length;
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+before.dx*step/4,y:before.y+before.dy*step/4,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+before.dx,y:before.y+before.dy,button:'left',buttons:0,clickCount:1},sessionId);
    await waitFor("!document.querySelector('.org-save-layout').disabled",'domain drag did not stage an anchor');
    const moved=await evaluate(`(()=>{const target=document.querySelector('${bubble}'),r=target.getBoundingClientRect(),org=document.querySelector('[data-organization-id="vbs-verteidigung"]').getBoundingClientRect();return{left:target.style.left,top:target.style.top,distance:Math.hypot(org.left+org.width/2-r.left-r.width/2,org.top+org.height/2-r.top-r.height/2)};})()`);
    invariant(moved.left!==before.left&&moved.distance<before.distance-10,'domain did not move closer to its organization');
    invariant((await cdp.call('Target.getTargets')).targetInfos.filter(target=>target.type==='page').length===targetsBefore,'dropping a dragged domain opened its detail link');
    await evaluate("document.querySelector('.org-save-layout').click()");
    await waitFor("document.querySelector('.org-save-layout').disabled&&document.querySelector('.org-layout-toolbar').getAttribute('aria-busy')==='false'",'domain anchor did not save');
    const saved=expectStatus(await api(actor,path),200,'read saved domain anchor').body;
    invariant(saved.configuration.scopes.vbs.offices[key].x<440,'profile domain anchor did not change');
    invariant(JSON.stringify(saved.configuration.scopes.vbs.offices['vbs-verteidigung'])===JSON.stringify(configuration.scopes.vbs.offices['vbs-verteidigung']),'moving a domain changed a saved organization anchor');
    await evaluate("document.querySelector('.org-layer [role=switch]').click()");await waitFor(`!document.querySelector('${bubble}')`,'domain layer did not hide');
    await evaluate("document.querySelector('.org-layer [role=switch]').click()");await waitFor(`document.querySelector('${bubble}')?.style.left===${JSON.stringify(moved.left)}`,'domain position was lost when toggling the layer');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10},sessionId);
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sessionId);
    const drift=await evaluate(`getComputedStyle(document.querySelector('${bubble}')).translate`);await sleep(1000);
    invariant(await evaluate(`getComputedStyle(document.querySelector('${bubble}')).translate!==${JSON.stringify(drift)}`),'domain no longer floats around its saved anchor');
    await capturePageSegmentScreenshot('.organization-explorer','domain-position-fullscreen-saved.png',1440,1100);
    await pressKey('Escape','Escape',27);
    await navigate('/?organization=vbs',actor,1440,1100);
    await enableOrganizationDomains();
    await waitFor(`document.querySelector('${bubble}')?.style.left===${JSON.stringify(moved.left)}&&!document.querySelector('.org-auto-layout').disabled`,'saved domain position did not survive reload');
    await evaluate(`document.querySelector('${bubble}').focus()`);await pressKey('ArrowDown','ArrowDown',40);
    await waitFor("!document.querySelector('.org-save-layout').disabled",'domain keyboard movement did not stage an anchor');
    await evaluate("document.querySelector('.org-discard-layout').click()");
    await waitFor(`document.querySelector('${bubble}')?.style.top===${JSON.stringify(moved.top)}`,'discard did not restore the saved domain position');
    await evaluate("document.querySelector('.org-auto-layout').click()");
    invariant(JSON.stringify(expectStatus(await api(actor,path),200,'automatic arrangement remains a draft').body)===JSON.stringify(saved),'automatic arrangement saved without confirmation');
    await evaluate("document.querySelector('.org-save-layout').click()");
    await waitFor("document.querySelector('.org-save-layout').disabled&&document.querySelector('.org-layout-toolbar').getAttribute('aria-busy')==='false'",'automatic reset did not save');
    const reset=expectStatus(await api(actor,path),200,'read reset domain layout').body;
    invariant(!reset.configuration.scopes.vbs,'automatic arrangement retained manual domain anchors');
    const otherScopes=Object.fromEntries(Object.entries(configuration.scopes).filter(([scope])=>scope!=='vbs'));
    invariant(JSON.stringify(reset.configuration.scopes)===JSON.stringify(otherScopes),'domain reset changed another organization level');
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/organization-network'),200,'verify unchanged catalog assignments').body)===JSON.stringify(graph),'domain placement changed shared catalog data');
    invariant(cdp.runtimeExceptions.length===0,`domain layout runtime errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS organization-domain-layout: real drag closer to organization, no link navigation, private save/reload, keyboard/discard, layer retention, fullscreen/floating, automatic reset and unchanged catalog');
  } finally {
    await cdp.call('Emulation.setEmulatedMedia',{features:[]},sessionId);
    const current=expectStatus(await api(actor,path),200,'read domain layout cleanup').body;
    expectStatus(await api(actor,path,{method:'PUT',body:{revision:current.revision,configuration:baseline.configuration}}),200,'restore original domain/organization anchors');
  }
}

async function contextMenuNavigationFlow() {
  const actor='fausto.marzo';
  const control=async(held)=>{await cdp.call('Input.dispatchKeyEvent',{type:held?'rawKeyDown':'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,modifiers:held?2:0},sessionId);await settleFrames();};
  const openTab=async(selector)=>{
    const before=new Set((await cdp.call('Target.getTargets')).targetInfos.map(item=>item.targetId));
    const expected=await evaluate(`document.querySelector(${JSON.stringify(selector)}).href`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);await settleFrames();
    const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,modifiers:2},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,modifiers:2,clickCount:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,modifiers:2,clickCount:1},sessionId);
    let target;
    for(let attempt=0;attempt<40;attempt++){
      target=(await cdp.call('Target.getTargets')).targetInfos.find(item=>!before.has(item.targetId)&&item.type==='page'&&item.url===expected);
      if(target)break;await sleep(100);
    }
    invariant(target,'Control-click did not open the exact native URL in a new tab: '+expected);
    await cdp.call('Target.closeTarget',{targetId:target.targetId});
    await control(false);
  };
  await navigate('/?organization=efd',actor,1440,1000);
  await waitFor('document.querySelector(".org-office[data-organization-id=efd-estv]")!==null','ESTV card missing');
  const menu=async()=>{await evaluate('document.querySelector(".org-office[data-organization-id=efd-estv]").scrollIntoView({block:"center",behavior:"instant"})');await settleFrames();await evaluate('(()=>{const node=document.querySelector(".org-office[data-organization-id=efd-estv]"),r=node.getBoundingClientRect();node.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:r.left+20,clientY:r.top+20}));})()');await waitFor('document.querySelector(".org-context-menu")!==null','Organization menu missing');};
  await menu();
  invariant(await evaluate('getComputedStyle(document.querySelector(".org-context-menu a"),"::after").visibility==="hidden"'),'New-tab icon is visible without Control');
  const menuLayout=await evaluate('[...document.querySelectorAll(".org-context-menu a")].map(link=>{const r=link.getBoundingClientRect(),s=link.querySelector("span").getBoundingClientRect();return[r.width,r.height,s.width,s.height]})');
  await captureScreenshot('context-menu-normal.png');
  await control(true);
  invariant(await evaluate('getComputedStyle(document.querySelector(".org-context-menu a"),"::after").visibility==="visible"'),'Control did not reveal navigation icon');
  invariant(await evaluate('JSON.stringify([...document.querySelectorAll(".org-context-menu a")].map(link=>{const r=link.getBoundingClientRect(),s=link.querySelector("span").getBoundingClientRect();return[r.width,r.height,s.width,s.height]}))')===JSON.stringify(menuLayout),'Control changed menu text wrapping or row dimensions');
  invariant(await evaluate('[...document.querySelectorAll(".org-context-menu button")].every(button=>getComputedStyle(button,"::after").content==="none")'),'Local or disabled commands advertise a new tab');
  await captureScreenshot('context-menu-control.png');
  const targetsBefore=(await cdp.call('Target.getTargets')).targetInfos.length;
  const previous=await evaluate('document.querySelector("[data-hide-unrelated-switch]").getAttribute("aria-checked")');
  await evaluate('document.querySelector("[data-hide-unrelated-option]").dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,ctrlKey:true}))');
  invariant(await evaluate('document.querySelector("[data-hide-unrelated-switch]").getAttribute("aria-checked")')!==previous,'Control changed the meaning of the local visibility toggle');
  invariant((await cdp.call('Target.getTargets')).targetInfos.length===targetsBefore,'Local visibility toggle opened a tab');
  await control(false);await menu();await control(true);await openTab('.org-context-menu a[data-organization-product-search]');
  invariant(await evaluate('location.pathname==="/"&&document.querySelector(".org-focus-title").textContent.trim()==="EFD"'),'Control-click replaced the current canvas');
  await menu();await evaluate('window.__contextNavigationMarker=true;document.querySelector(".org-context-menu a").click()');
  await waitFor('document.querySelector(".org-focus-title")?.textContent.trim()==="ESTV"','Normal drill-down did not stay in the current canvas');
  invariant(await evaluate('window.__contextNavigationMarker===true'),'Normal drill-down reloaded the page');
  await navigate('/products?relationship=all',actor,1440,1000);
  await waitFor('document.querySelector(".product-context-trigger")!==null','Product context trigger missing');
  await evaluate('document.querySelector(".product-context-trigger").click()');await waitFor('document.querySelector(".product-context-popover a")!==null','Product context menu missing');
  await control(true);await openTab('.product-context-popover a');
  invariant(await evaluate('location.pathname==="/products"'),'Product Control-click replaced the catalog');
  await evaluate('if(!document.querySelector(".product-context-popover"))document.querySelector(".product-context-trigger").click()');await waitFor('document.querySelector(".product-context-popover a")!==null','Product menu did not reopen');
  const destination=await evaluate('document.querySelector(".product-context-popover a").getAttribute("href")');
  await evaluate('window.__contextNavigationMarker=true;document.querySelector(".product-context-popover a").click()');
  await waitFor(`location.pathname===${JSON.stringify(destination)}`,'Normal product menu click did not navigate in the current tab');
  invariant(await evaluate('window.__contextNavigationMarker===true'),'Normal router link performed a document reload');
  invariant(cdp.runtimeExceptions.length===0,JSON.stringify(cdp.runtimeExceptions));
  console.log('PASS context menus: Control-only icons, native exact-URL new tabs, current-tab routing, unchanged local toggle and no document reload');
}

async function requesterDecisionFlow() {
  const actor='fausto.marzo',owner='kassandra.valdata',stamp=Date.now();
  let productId,published;
  await navigate('/',actor,1440,1000);
  const fixture=expectStatus(await api(owner,'/api/v1/poc/product-fixtures'),200,'read synthetic publication fixture').body.find(item=>item.id==='kassandra-bronze');
  const payload=structuredClone(fixture.payload);
  payload.publicationMode='automatic';payload.sourceProductId=`daca.notification-check.${stamp}`;
  payload.businessMetadata.title=`Synthetische Antragsbenachrichtigung ${stamp}`;
  payload.technicalMetadata.endpoint.path=`/synthetic-notification-check/${stamp}`;
  try {
    productId=expectStatus(await api(owner,'/api/v1/metadata-publications',{method:'POST',body:payload}),201,'publish only synthetic notification metadata').body.productId;
    const today=new Date().toISOString().slice(0,10);
    const request=expectStatus(await api(actor,`/api/v1/data-products/${productId}/access-requests`,{method:'POST',body:{consumerType:'person',machineId:null,purpose:'Synthetische Prüfung der persönlichen Benachrichtigung nach Freigabe.',legalBasis:'Amtshilfe',requestedProtocol:'http',requestedVariant:'modified',validFrom:today,validUntil:null,contactEmail:'fausto.marzo@example.invalid',notes:null,conditionsAccepted:true}}),201,'create isolated notification request').body;
    await navigate(`/products/${productId}/usage?request=${request.id}`,actor,1440,1000);
    await waitFor(`document.querySelector('[data-testid="request-decision"]')?.textContent.includes(${JSON.stringify(request.requestNumber)})`,'personal request context did not load');
    await evaluate("document.querySelector('.daca-authority-notification').click()");
    const approved=expectStatus(await api(owner,`/api/v1/access-requests/${request.id}/decision`,{method:'POST',body:{decision:'approve',grantedVariant:'modified'}}),200,'owner approves isolated request').body;
    await waitFor(`(()=>{const links=[...document.querySelectorAll('details[open] .notification-item')];return links.some(link=>link.textContent.includes(${JSON.stringify(request.requestNumber)})&&link.textContent.includes('Freigabe steht noch aus'));})()`,'approval did not arrive in the requester bell without reload');
    await waitFor("document.querySelector('[data-testid=request-decision]')?.textContent.includes('noch nicht technisch aktiviert')",'already-open request did not refresh after approval');
    invariant(!await evaluate(`(()=>{const links=[...document.querySelectorAll('details[open] .notification-item')];return links.some(link=>link.textContent.includes(${JSON.stringify(request.requestNumber)})&&link.textContent.includes('Zugriff gewährt'));})()`),'approval was incorrectly advertised as an effective grant');
    await captureScreenshot('requester-approval-pending.png');
    published=expectStatus(await api(owner,`/api/v1/data-products/${productId}/policies/${approved.policy.id}/publish`,{method:'POST',etag:`"${approved.policy.revision}"`}),201,'publish isolated request policy through real enforcement projections').body;
    await waitFor(`(()=>{const links=[...document.querySelectorAll('details[open] .notification-item')];return links.some(link=>link.textContent.includes(${JSON.stringify(request.requestNumber)})&&link.textContent.includes('Zugriff gewährt'));})()`,'confirmed grant did not arrive automatically in the open requester bell');
    const messages=expectStatus(await api(actor,'/api/v1/tasks/mine'),200,'read requester decision messages').body.filter(item=>item.accessRequestId===request.id);
    invariant(messages.length===1&&messages[0].taskType==='access_request_granted','grant did not replace the pending approval message exactly once');
    invariant(!expectStatus(await api('ariane.keller','/api/v1/tasks/mine'),200,'read unrelated messages').body.some(item=>item.accessRequestId===request.id),'another person received the requester decision');
    await evaluate(`document.querySelector('.notification-item[data-notification-id="task:${messages[0].id}"]').click()`);
    await waitFor(`document.querySelector('[data-testid=request-decision]')?.textContent.includes(${JSON.stringify(request.requestNumber)})&&document.querySelector('[data-testid=request-decision]')?.textContent.includes('Zugriff gewährt (modifiziert)')`,'grant link did not show the exact request and final status');
    await evaluate("document.querySelector('[data-testid=request-decision]').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
    await captureScreenshot('requester-granted-desktop.png');
    await setViewport(390,844);await evaluate("document.querySelector('[data-testid=request-decision]').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
    invariant(await evaluate("(()=>{const card=document.querySelector('[data-testid=request-decision]'),r=card.getBoundingClientRect(),heading=card.querySelector('h2').getBoundingClientRect(),button=card.querySelector('button').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&heading.width>r.width*.6&&button.width>=140&&button.right<=r.right;})()"),'personal decision context is clipped or cramped on mobile');
    await captureScreenshot('requester-granted-mobile.png');
    await clickText('[data-testid=request-decision] button','Zur Kenntnis nehmen');
    await waitFor(`!document.querySelector('.notification-item[data-notification-id="task:${messages[0].id}"]')`,'acknowledged requester message did not leave the bell');
    await navigate(`/products/${productId}/usage?request=${request.id}`,actor,1440,1000);
    await waitFor("document.querySelector('[data-testid=request-decision]')?.textContent.includes('Zugriff gewährt (modifiziert)')",'grant status was lost after reload');
    invariant(!expectStatus(await api(actor,'/api/v1/tasks/mine'),200,'verify durable acknowledgement').body.some(item=>item.id===messages[0].id),'acknowledged message was recreated');
    invariant(cdp.runtimeExceptions.length===0,`Requester decision errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS requester decision: live approval and confirmed grant, real OPA/PostgreSQL publication, private bell, exact request context, mobile and durable acknowledgement');
  } finally {
    if(productId){
      if(published){
        const policyPage=expectStatus(await api(owner,`/api/v1/data-products/${productId}/policies`),200,'read synthetic policies for cleanup').body;
        const policies=Array.isArray(policyPage)?policyPage:policyPage.items;
        const latest=policies.reduce((left,right)=>left.revision>right.revision?left:right);
        expectStatus(await api(owner,`/api/v1/data-products/${productId}/policies/${published.id}/revoke`,{method:'POST',etag:`"${latest.revision}"`}),201,'revoke only the synthetic test policy');
      }
      const product=expectStatus(await api(owner,`/api/v1/data-products/${productId}`),200,'read synthetic product for retirement');
      expectStatus(await api(owner,`/api/v1/data-products/${productId}`,{method:'PATCH',etag:`"${product.body.revision}"`,body:{lifecycle:'retired'}}),200,'retire only synthetic notification product');
      const messages=expectStatus(await api(actor,'/api/v1/tasks/mine'),200,'read synthetic message cleanup').body.filter(task=>task.dataProductId===productId&&task.taskKind==='information');
      for(const message of messages)expectStatus(await api(actor,`/api/v1/tasks/${message.id}/acknowledge`,{method:'POST'}),200,'close only synthetic decision message');
    }
  }
}

async function productAccessRequestFlow(openEnded=false,productId='11111111-1111-4111-8111-111111111111') {
  const actor='fausto.marzo';
  let owner;
  const purpose=`Synthetische Produktseiten-Anfrage zur Plausibilisierung aggregierter Kennzahlen ${Date.now()}`;
  let request,followUpRequest;
  try {
    await navigate(`/products/${productId}/overview`,actor,1440,1000);
    owner=expectStatus(await api(actor,`/api/v1/data-products/${productId}`),200,'read assigned Data Owner').body.ownerUserId;
    await waitFor("document.querySelector('.product-overview-request-access')!==null",'consumer request action missing from product overview');
    invariant(await evaluate(`(()=>{const link=document.querySelector('.product-overview-request-access'),r=link.getBoundingClientRect(),badge=document.querySelector('.product-overview-heading daca-status-badge').getBoundingClientRect();return link.getAttribute('href')==='/products/${productId}/access-request'&&r.height>=44&&r.bottom<=badge.top;})()`),'request action must appear above the status badge with a touch-sized target');
    await captureScreenshot('product-request-desktop.png');
    await setViewport(390,844);await settleFrames();
    invariant(await evaluate("(()=>{const r=document.querySelector('.product-overview-request-access').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&r.width>0&&r.height>=44&&r.left>=0&&r.right<=innerWidth;})()"),'request action is clipped on mobile');
    await captureScreenshot('product-request-mobile.png');
    await evaluate("document.querySelector('.product-overview-request-access').click()");
    await waitFor("document.querySelector('.access-request-form')!==null",'overview button did not open the existing request form');
    await setControls({'[formcontrolname=purpose]':purpose,'[formcontrolname=legalBasis]':'Amtshilfe zwischen Behörden','[formcontrolname=contactEmail]':'fausto.marzo@example.invalid'});
    if(openEnded){
      await evaluate("document.querySelector('[formcontrolname=openEnded]').click()");
      invariant(await evaluate("document.querySelector('[formcontrolname=validUntil]').disabled"),'indefinite request still requires an end date');
      await evaluate("document.querySelector('[formcontrolname=openEnded]').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
      await captureScreenshot('product-request-unbounded-form.png');
    }
    await evaluate("document.querySelector('.access-request-consent input').click()");
    await clickText('.access-request-form button','Zugriffsanfrage einreichen');
    await waitFor("document.querySelector('.access-request-confirmation')?.textContent.includes('Ihre Zugriffsanfrage ist eingegangen')",'submitted request receipt missing');
    request=expectStatus(await api(actor,`/api/v1/data-products/${productId}/access-requests/mine`),200,'read submitted request').body.find(item=>item.purpose===purpose);
    invariant(request?.status==='submitted'&&request.requesterId===actor,'request was not persisted for the authenticated requester');
    const contact=expectStatus(await api(actor,'/api/v1/demo-users'),200,'read current owner contact').body.find(person=>person.id===owner);
    invariant(contact,'assigned Data Owner is missing from the person directory');
    await waitFor(`(()=>{const card=document.querySelector('.access-request-owner-contact'),photo=card?.querySelector('img'),link=card?.querySelector('a');return card?.textContent.includes(${JSON.stringify(contact.displayName)})&&photo?.complete&&photo.naturalWidth>0&&photo.getAttribute('src')===${JSON.stringify(contact.avatarUrl)}&&link?.getAttribute('href')===${JSON.stringify('https://teams.microsoft.com/l/chat/0/0?users='+encodeURIComponent(contact.email))};})()`,'receipt did not show the current owner portrait and Teams contact');
    invariant(await evaluate(`document.querySelector('.access-request-owner-contact').textContent.includes(${JSON.stringify(contact.organization)})`),'receipt is missing the current owner organization');
    await setViewport(1440,1000);await evaluate("document.querySelector('.access-request-owner-contact').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
    await captureScreenshot('product-request-receipt-desktop.png');
    await setViewport(390,844);await evaluate("document.querySelector('.access-request-owner-contact').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
    invariant(await evaluate("(()=>{const card=document.querySelector('.access-request-owner-contact'),r=card.getBoundingClientRect(),link=card.querySelector('a').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&r.left>=0&&r.right<=innerWidth&&link.height>=44&&link.right<=innerWidth;})()"),'Data Owner contact or Teams target is clipped on mobile');
    await captureScreenshot('product-request-receipt-mobile.png');
    if(openEnded)invariant(request.validUntil===null,'indefinite request did not persist an explicit null end date');
    const tasks=expectStatus(await api(owner,'/api/v1/tasks/mine'),200,'read owner notifications').body;
    invariant(tasks.some(task=>task.taskType==='access_request_review'&&task.accessRequestId===request.id),'request did not notify the product Data Owner');
    invariant(!expectStatus(await api('ariane.keller','/api/v1/tasks/mine'),200,'read unrelated notifications').body.some(task=>task.accessRequestId===request.id),'request notification went to an unrelated owner');
    await navigate(`/products/${productId}/overview`,owner,1440,1000);
    await waitFor("document.querySelector('.daca-authority-notification')!==null",'owner notification bell missing');
    invariant(await evaluate("document.querySelector('.product-overview-request-access')===null"),'owner was offered a request for their own product');
    await evaluate("document.querySelector('.daca-authority-notification').click()");
    await waitFor(`document.querySelector('details[open] .notification-item[data-notification-id="request:${request.id}"]')!==null`,'request did not appear in notification flyout');
    invariant(await evaluate(`document.querySelectorAll('.notification-item[data-notification-id="request:${request.id}"]').length===1`),'request was counted twice in notification list');
    followUpRequest=expectStatus(await api(actor,`/api/v1/data-products/${productId}/access-requests`,{method:'POST',body:{consumerType:'person',machineId:null,purpose:purpose+' · Hintergrundaktualisierung',legalBasis:'Amtshilfe zwischen Behörden',requestedProtocol:'http',requestedVariant:'modified',validFrom:request.validFrom,validUntil:request.validUntil,contactEmail:'fausto.marzo@example.invalid',notes:null,conditionsAccepted:true}}),201,'submit follow-up while owner keeps notification panel open').body;
    await waitFor(`document.querySelector('details[open] .notification-item[data-notification-id="request:${followUpRequest.id}"]')!==null`,'new request did not appear automatically in the open owner notification panel');
    invariant(await evaluate(`document.querySelectorAll('.notification-item[data-notification-id="request:${followUpRequest.id}"]').length===1`),'follow-up request appeared twice');
    await captureScreenshot('product-request-notification.png');
    await setViewport(390,844);await settleFrames();
    await captureScreenshot('product-request-notification-mobile.png');
    const panelBounds=await evaluate("(()=>{const r=document.querySelector('.notification-panel').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})()");
    invariant(panelBounds.left>=0&&panelBounds.right<=panelBounds.width&&panelBounds.top>=0&&panelBounds.bottom<=panelBounds.height,'notification panel is clipped on mobile: '+JSON.stringify(panelBounds));
    invariant(await evaluate("['.daca-authority-notification','.daca-header-language','.daca-header-theme','.daca-header-documentation','.daca-header-settings'].every(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=document.documentElement.clientWidth;})"),'mobile header controls are clipped beside the user name');
    await setViewport(1440,1000);await settleFrames();
    await evaluate(`document.querySelector('.notification-item[data-notification-id="request:${request.id}"]').click()`);
    await waitFor(`document.querySelector('a[data-testid="access-request-to-setting"][href*="${request.id}"]')!==null`,'submitted request missing from owner tasks');
    await captureScreenshot('product-request-owner-task.png');
    await evaluate(`document.querySelector('a[data-testid="access-request-to-setting"][href*="${request.id}"]').click()`);
    await waitFor(`document.querySelector('[data-testid="linked-access-request"]')?.textContent.includes(${JSON.stringify(request.requestNumber)})`,'owner could not open this request for review');
    await waitFor(`document.querySelector('.exposure-directory-results [aria-selected="true"]')?.textContent.includes('${actor}')`,'requester identity was not carried into review');
    if(openEnded){
      invariant(await evaluate("document.querySelector('.exposure-rule-section .access-request-open-ended input').checked"),'owner review lost the indefinite end date');
      invariant(await evaluate("!document.body.textContent.includes('9999-12-31')"),'owner review exposed an internal end-date ceiling');
      await evaluate("document.querySelector('.exposure-rule-section .access-request-open-ended').scrollIntoView({block:'center',behavior:'instant'})");await settleFrames();
      await captureScreenshot('product-request-unbounded-review.png');
    }
    await navigate('/tasks',owner,1440,1000);
    await waitFor(`document.querySelector('a[data-testid="access-request-to-setting"][href*="${request.id}"]')!==null`,'reviewed request missing from owner inbox');
    await evaluate(`(()=>{const card=document.querySelector('a[data-testid="access-request-to-setting"][href*="${request.id}"]').closest('article');[...card.querySelectorAll('button')].find(button=>button.textContent.trim()==='Ablehnen').click();})()`);
    await waitFor(`(async()=>{const response=await fetch('/api/v1/data-products/${productId}/access-requests/mine',{headers:{'X-DaCa-User':'${actor}'}});return response.ok&&(await response.json()).some(item=>item.id==='${request.id}'&&item.status==='rejected');})()`,'owner decision was not persisted');
    await navigate(`/products/${productId}/access-request`,actor,1440,1000);
    await waitFor(`document.querySelector('.access-request-history')?.textContent.includes(${JSON.stringify(request.requestNumber)})&&document.querySelector('.access-request-history')?.textContent.includes('Zugriff nicht gewährt')`,'requester could not see owner decision after reload');
    const decisions=expectStatus(await api(actor,'/api/v1/tasks/mine'),200,'read rejection message').body.filter(task=>task.accessRequestId===request.id&&task.taskType==='access_request_rejected');
    invariant(decisions.length===1,'requester did not receive one rejection message');
    await evaluate("document.querySelector('.daca-authority-notification').click()");
    await waitFor(`document.querySelector('.notification-item[data-notification-id="task:${decisions[0].id}"]')!==null`,'rejection was not visible in the requester bell');
    await evaluate(`document.querySelector('.notification-item[data-notification-id="task:${decisions[0].id}"]').click()`);
    await waitFor(`document.querySelector('[data-testid=request-decision]')?.textContent.includes(${JSON.stringify(request.requestNumber)})&&document.querySelector('[data-testid=request-decision]')?.textContent.includes('Nicht gewährt')`,'rejection message did not open the personal request');
    invariant(cdp.runtimeExceptions.length===0,`Product request errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS product-access-request: desktop/mobile action and notification panel, existing form, persisted submission, owner-only messages/bell/inbox, live arrival without reload, deduplication, trusted review identity, rejection and requester history; no policy publication');
  } finally {
    // Close only this synthetic request; preserve its append-only workflow evidence.
    for(const created of [request,followUpRequest])if(created){
      const current=expectStatus(await api(actor,`/api/v1/data-products/${productId}/access-requests/mine`),200,'read request cleanup').body.find(item=>item.id===created.id);
      if(current&&['submitted','identity_review','legal_review','conditions_review'].includes(current.status))expectStatus(await api(owner,`/api/v1/access-requests/${created.id}/decision`,{method:'POST',body:{decision:'reject',comment:'Synthetic product overview browser check complete.'}}),200,'close only test request');
      const messages=expectStatus(await api(actor,'/api/v1/tasks/mine'),200,'read test decision cleanup').body.filter(task=>task.accessRequestId===created.id&&task.taskKind==='information');
      for(const message of messages)expectStatus(await api(actor,`/api/v1/tasks/${message.id}/acknowledge`,{method:'POST'}),200,'acknowledge only test decision message');
    }
  }
}

async function organizationLayoutFlow() {
  const actor='kassandra.valdata',path='/api/v1/organization-network/view';
  await navigate('/',actor,1440,1100);
  const baseline=expectStatus(await api(actor,path),200,'read organization layout baseline').body;
  const other=expectStatus(await api('beat.stalder',path),200,'read other organization layout').body;
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'read unchanged organizations').body;
  try {
    expectStatus(await api(actor,path,{method:'PUT',body:{revision:baseline.revision,configuration:{schemaVersion:1,scopes:{}}}}),200,'prepare empty personal anchors');
    await navigate('/?organization=all',actor,1440,1100);
    await waitFor("!document.querySelector('.org-auto-layout').disabled",'organization anchors did not load');
    await evaluate("document.querySelector('.org-fullscreen').click()");
    await waitFor("document.querySelector('.organization-explorer.is-fullscreen[aria-modal=true]')&&document.body.style.overflow==='hidden'",'organization fullscreen did not open');
    invariant(await evaluate("(()=>{const r=document.querySelector('.organization-explorer').getBoundingClientRect();return r.left===0&&r.top===0&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2;})()"),'fullscreen does not cover the viewport');
    await waitFor("document.activeElement===document.querySelector('.org-fullscreen')",'fullscreen did not focus its exit control');await settleFrames();
    await evaluate("document.querySelector('.org-accessible-list summary').focus()");await settleFrames();await pressKey('Tab','Tab',9);
    invariant(await evaluate("document.activeElement===document.querySelector('.org-layout-toolbar button:not(:disabled)')"),'fullscreen focus escaped after last control: '+await evaluate("document.activeElement?.outerHTML.slice(0,400)"));
    await pressKey('Tab','Tab',9); // Continue within the modal before starting a pointer gesture.
    const before=await evaluate("(()=>{const c=document.querySelector('.org-office[data-organization-id=efd]'),r=c.getBoundingClientRect(),s=document.querySelector('.org-stage').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,dx:r.left+r.width/2<s.left+s.width/2?65:-65,dy:r.top+r.height/2<s.top+s.height/2?25:-25,left:c.style.left};})()");
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1},sessionId);
    for(let step=1;step<=4;step++)await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+before.dx*step/4,y:before.y+before.dy*step/4,buttons:1},sessionId);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+before.dx,y:before.y+before.dy,button:'left',buttons:0,clickCount:1},sessionId);
    await waitFor("!document.querySelector('.org-save-layout').disabled&&!document.querySelector('.org-core')",'drag navigated or failed to stage a position');
    invariant(await evaluate(`document.querySelector('.org-office[data-organization-id=efd]').style.left!==${JSON.stringify(before.left)}`),'drag did not move the organization anchor');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5},sessionId);
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]},sessionId);
    const drift=await evaluate("getComputedStyle(document.querySelector('.org-office[data-organization-id=efd]')).translate");await sleep(1000);
    invariant(await evaluate(`getComputedStyle(document.querySelector('.org-office[data-organization-id=efd]')).translate!==${JSON.stringify(drift)}`),'moved organization stopped floating');
    await evaluate("document.querySelector('.org-save-layout').click()");
    await waitFor("document.querySelector('.org-save-layout').disabled&&document.querySelector('.org-layout-toolbar').getAttribute('aria-busy')==='false'&&document.querySelector('.org-layout-message[role=status]')",'organization layout did not save');
    const saved=expectStatus(await api(actor,path),200,'read saved overview anchors').body;
    invariant(saved.configuration.scopes.overview.offices.efd,'overview anchor missing from profile');
    const savedLeft=await evaluate("document.querySelector('.org-office[data-organization-id=efd]').style.left");
    await capturePageSegmentScreenshot('.organization-explorer','organization-fullscreen-saved.png',1440,1100);
    await pressKey('Escape','Escape',27);
    await waitFor("!document.querySelector('.organization-explorer.is-fullscreen')&&document.body.style.overflow!=='hidden'",'Escape did not restore page scrolling');
    await navigate('/?organization=all',actor,1440,1100);
    invariant(await evaluate(`document.querySelector('.org-office[data-organization-id=efd]').style.left===${JSON.stringify(savedLeft)}`),'organization anchor did not survive reload');
    await evaluate("document.querySelector('.org-office[data-organization-id=efd]').click()");
    await waitFor("document.querySelector('.org-focus')?.textContent.includes('EFD')",'saved card cannot drill down');
    // External cantons must never look like members of the focused department.
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    for(const fullscreen of [false,true]){
      if(fullscreen){await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();}
      const selector=await evaluate(`(()=>{const card=[...document.querySelectorAll('.org-satellite')].find(card=>card.textContent.includes('St. Gallen'));if(!card)throw new Error('St. Gallen satellite missing');return '.org-satellite[data-organization-id="'+card.dataset.organizationId+'"]';})()`);
      const clear=()=>evaluate(`(()=>{const card=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),scope=document.querySelector('.org-bubble').getBoundingClientRect();return card.right<=scope.left||card.left>=scope.right||card.bottom<=scope.top||card.top>=scope.bottom;})()`);
      for(const touch of [false,true]){
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);await settleFrames();
        const points=await evaluate(`(()=>{const card=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),scope=document.querySelector('.org-bubble').getBoundingClientRect();return{from:{x:card.left+card.width/2,y:card.top+card.height/2},to:{x:scope.left+scope.width/2,y:scope.top+scope.height/2}};})()`);
        if(touch){
          await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points.from,id:1}]},sessionId);
          await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...points.to,id:1}]},sessionId);
          await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId);
        }else{
          await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.from},sessionId);
          await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1},sessionId);
          await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.to,buttons:1},sessionId);
          await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1},sessionId);
        }
        await settleFrames();invariant(await clear(),`external canton entered EFD during ${touch?'touch':'mouse'} drag (fullscreen=${fullscreen})`);
        const key=await evaluate(`(()=>{const card=document.querySelector(${JSON.stringify(selector)}),r=card.getBoundingClientRect(),s=document.querySelector('.org-bubble').getBoundingClientRect();card.focus();return r.right<=s.left?'ArrowRight':r.left>=s.right?'ArrowLeft':r.bottom<=s.top?'ArrowDown':'ArrowUp';})()`);
        for(let step=0;step<12;step++)await pressKey(key,key,{ArrowRight:39,ArrowLeft:37,ArrowDown:40,ArrowUp:38}[key]);
        await settleFrames();invariant(await clear(),'external canton entered EFD using arrow keys');
        invariant(await evaluate("document.querySelector('.org-focus')?.textContent.includes('EFD')"),'boundary drag navigated into another organization');
      }
      await evaluate("document.querySelector('.org-discard-layout').click()");
      if(fullscreen){await evaluate("document.querySelector('.org-fullscreen').click()");await settleFrames();}
    }
    await cdp.call('Emulation.setEmulatedMedia',{features:[]},sessionId);
    const officeKey=await evaluate("(()=>{const card=document.querySelector('.org-office[data-organization-id=\"efd-estv\"]');card.focus();return parseFloat(card.style.top)<50?'ArrowDown':'ArrowUp';})()");await pressKey(officeKey,officeKey,officeKey==='ArrowDown'?40:38);
    const satelliteKey=await evaluate("(()=>{const card=document.querySelector('.org-satellite[data-organization-id=vbs]');card.focus();return parseFloat(card.style.left)<50?'ArrowRight':'ArrowLeft';})()");await pressKey(satelliteKey,satelliteKey,satelliteKey==='ArrowRight'?39:37);
    await waitFor("!document.querySelector('.org-save-layout').disabled",'nested anchor changes were not staged');
    await evaluate("document.querySelector('.org-save-layout').click()");await waitFor("document.querySelector('.org-save-layout').disabled&&document.querySelector('.org-layout-toolbar').getAttribute('aria-busy')==='false'",'nested anchors did not save');
    const nested=expectStatus(await api(actor,path),200,'read per-level office and satellite anchors').body;
    invariant(nested.configuration.scopes.efd.offices['efd-estv']&&nested.configuration.scopes.efd.satellites.vbs,'nested anchors missing');
    invariant(JSON.stringify(nested.configuration.scopes.overview)===JSON.stringify(saved.configuration.scopes.overview),'nested edits overwrote overview');
    await evaluate("document.querySelector('.org-auto-layout').click()");await waitFor("!document.querySelector('.org-save-layout').disabled",'reset was not staged');await evaluate("document.querySelector('.org-save-layout').click()");await waitFor("document.querySelector('.org-save-layout').disabled&&document.querySelector('.org-layout-toolbar').getAttribute('aria-busy')==='false'",'reset did not save');
    const reset=expectStatus(await api(actor,path),200,'read level reset').body;
    invariant(!reset.configuration.scopes.efd&&JSON.stringify(reset.configuration.scopes.overview)===JSON.stringify(saved.configuration.scopes.overview),'reset changed the wrong scope');
    await navigate('/?organization=all',actor,390,850);
    await evaluate("document.querySelector('.org-fullscreen').click()");
    await waitFor("document.querySelector('.organization-explorer.is-fullscreen')",'mobile fullscreen missing');
    invariant(await evaluate("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.org-viewport').scrollWidth>document.querySelector('.org-viewport').clientWidth"),'mobile canvas must pan locally');
    await evaluate("document.querySelector('.org-office[data-organization-id=efd]').scrollIntoView({block:'nearest',inline:'center',behavior:'instant'})");await settleFrames();
    const touch=await evaluate("(()=>{const c=document.querySelector('.org-office[data-organization-id=efd]'),r=c.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,left:c.style.left};})()");
    await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y,id:1}]},sessionId);
    await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+25,y:touch.y+12,id:1}]},sessionId);
    await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId);
    await waitFor("!document.querySelector('.org-save-layout').disabled&&!document.querySelector('.org-core')",'touch moved the viewport or drilled into the card');
    await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    invariant(await evaluate("[...document.querySelectorAll('.org-office,.org-satellite')].every(card=>getComputedStyle(card).animationName==='none')"),'personal anchors ignored reduced motion');
    await capturePageSegmentScreenshot('.organization-explorer','organization-fullscreen-mobile.png',390,850);
    await pressKey('Escape','Escape',27);await evaluate("document.querySelector('.org-discard-layout').click()");
    invariant(JSON.stringify(expectStatus(await api('beat.stalder',path),200,'verify private layout isolation').body)===JSON.stringify(other),'another profile layout changed');
    invariant(JSON.stringify(expectStatus(await api(actor,'/api/v1/organization-network'),200,'verify organization graph').body)===JSON.stringify(graph),'layout editing changed shared organizations or relations');
    invariant(cdp.runtimeExceptions.length===0,`Organization layout errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
    console.log('PASS organization-layout: fullscreen, focus containment, mouse/touch/keyboard anchors, profile save/reload, floating, per-level reset, mobile/reduced motion, private/shared isolation');
  } catch(error) {console.error('Organization layout scenario:',error.message);throw error;} finally {
    await waitFor("document.querySelector('.org-layout-toolbar')?.getAttribute('aria-busy')!=='true'",'layout save did not settle before cleanup');
    await cdp.call('Emulation.setEmulatedMedia',{features:[]},sessionId);
    const current=expectStatus(await api(actor,path),200,'read organization layout cleanup').body;
    expectStatus(await api(actor,path,{method:'PUT',body:{revision:current.revision,configuration:baseline.configuration}}),200,'restore original organization layout');
  }
}

async function organizationExplorerFlow() {
  const actor='kassandra.valdata';
  // Exercise automatic placement without changing any user's saved anchors.
  // Personal placement persistence is covered separately by organization-layout.
  cdp.mockReadResponses=new Map([['/api/v1/organization-network/view',{revision:0,configuration:{schemaVersion:1,scopes:{}}}]]);
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/organization-network/view',requestStage:'Request'}]},sessionId);
  try {
  await navigate('/',actor,1440,1000);
  await waitFor("document.querySelector('.org-stage')&&document.querySelector('.org-focus').textContent.includes('EFD')",'organization home did not resolve EFD');
  await waitFor("!document.querySelector('.org-domain-bubble')&&document.querySelector('.org-layer .identifier-mode-switch[aria-checked=false] .identifier-mode-switch-thumb')",'domains must be hidden by default with the shared standard toggle');
  await capturePageSegmentScreenshot('.organization-explorer','organization-domains-default.png',1440,1000);
  await evaluate("document.querySelector('.org-layer [role=switch]').click()");
  await waitFor("document.querySelector('.org-domain-bubble')&&document.querySelector('.org-layer [aria-checked=true]')",'standard toggle did not show domains');
  await evaluate("document.querySelector('.org-layer [role=switch]').click()");
  invariant(await evaluate("document.querySelector('#organization-explorer-title').textContent.trim()==='Datenraum der Schweizer Verwaltung und der bundesnahen Betriebe'"),'data landscape title differs from the requested wording');
  invariant(await evaluate("parseFloat(getComputedStyle(document.querySelector('.welcome-intro h1')).fontSize)>=50&&parseFloat(getComputedStyle(document.querySelector('.welcome-intro')).paddingTop)>=50"),'original welcome typography and spacing were not restored');
  await capturePageSegmentScreenshot('.welcome-intro','welcome-original-size.png',1440,900);
  const graph=expectStatus(await api(actor,'/api/v1/organization-network'),200,'organization graph').body;
  invariant(graph.homeId==='efd'&&graph.nodes.some(node=>node.id==='efd-estv-bi'),'trusted hierarchy or BI unit missing');
  await evaluate("document.querySelector('.org-layer [role=switch]').click()");
  const officeAssignments=graph.domains.filter(domain=>domain.label.startsWith('ROHS ')||domain.label==='Mehrwertsteuer');
  invariant(officeAssignments.length>=3,'ROHS/VAT regression examples missing');
  for(const domain of officeAssignments){
    const office=domain.label.startsWith('ROHS ')?'efd-bit':'efd-estv',code=office==='efd-bit'?'BIT':'ESTV';
    invariant(domain.organizationIds.includes(office),'trusted domain ancestry lacks '+code+': '+domain.label);
    await waitFor(`document.querySelector('.org-domain-thread[data-domain-id="${domain.id}"][data-source-id="${office}"]')`,'domain line does not project to its visible assigned office: '+domain.label);
    invariant(await evaluate(`document.querySelector('.org-domain-bubble[data-domain-id="${domain.id}"] .org-domain-assignment')?.textContent.includes('${code}')`),'domain bubble lacks its visible office assignment: '+domain.label);
  }
  const organizationLinkLengths=await evaluate("[...document.querySelectorAll('.org-thread')].map(line=>line.getTotalLength())");
  console.log('Organization link lengths:',organizationLinkLengths.map(value=>Math.round(value)).join(', '));
  const placementView=expectStatus(await api(actor,'/api/v1/organization-network/view'),200,'read personal placement constraints').body;
  const efdAnchors=placementView.configuration.scopes.efd;
  if(!efdAnchors||(!Object.keys(efdAnchors.offices??{}).length&&!Object.keys(efdAnchors.satellites??{}).length))invariant(organizationLinkLengths.every(length=>length<400),'automatic EFD placement still has a data link across the diagram');

  await capturePageSegmentScreenshot('.organization-explorer','organization-assigned-domain-clusters.png',1440,1000);
  await evaluate("document.querySelector('.org-layer [role=switch]').click()");

  const sg=graph.nodes.find(node=>node.label==='Kanton St. Gallen');
  const ne=graph.nodes.find(node=>node.label==='Kanton Neuchâtel');
  invariant(sg&&ne,'cantonal directory nodes missing');
  for(const organization of [sg,ne,graph.nodes.find(node=>node.id==='efd-estv')]){
    invariant(Number.isInteger(organization.consumedProductCount),'separate consumption count missing: '+organization.label);
    invariant(await evaluate(`(()=>{const card=document.querySelector('[data-organization-id="${organization.id}"]');return Number(card.querySelector('.org-offered-count').textContent.match(/\\d+/)[0])===${organization.productCount}&&Number(card.querySelector('.org-consumed-count').textContent.match(/\\d+/)[0])===${organization.consumedProductCount}&&card.getAttribute('aria-label').includes('konsumiert');})()`),'offering and consumption not distinguished on card: '+organization.label);
  }
  invariant(await evaluate("document.querySelector('.org-count-legend').textContent.includes('Angebot (Datenprodukte)')&&document.querySelector('.org-count-legend').textContent.includes('Konsumation (Datenprodukte)')&&document.querySelector('.org-focus-counts').textContent.includes('konsumiert')"),'offering/consumption legend or focus summary missing');
  invariant(graph.relations.some(edge=>edge.sourceId==='efd-estv'&&edge.targetId===sg.id&&edge.evidence.includes('published-policy')),'existing St. Gallen policy relation missing');
  invariant(graph.relations.some(edge=>edge.sourceId===sg.id&&edge.targetId==='vbs-armasuisse'),'new Zeughaus relation to armasuisse missing');
  for(const canton of [sg,ne]) {
    invariant(await evaluate(`(()=>{const card=document.querySelector('.org-satellite[data-organization-id="${canton.id}"]');return card?.classList.contains('is-connected')&&card.querySelector('.org-canton-prefix')?.textContent==='Kanton'&&parseFloat(getComputedStyle(card.querySelector('.org-canton-prefix')).fontSize)<parseFloat(getComputedStyle(card.querySelector('strong')).fontSize);})()`),'connected canton is gray or lacks its small prefix: '+canton.label);
  }
  invariant(await evaluate("!document.querySelector('.org-satellite[data-organization-id=\"eda\"]')?.classList.contains('is-connected')"),'unrelated outside organization is highlighted');
  await capturePageSegmentScreenshot('.organization-explorer','organization-connected-cantons.png',1440,1000);
  const overviewNodes=graph.nodes.filter(node=>node.parentId===null||['SBB','Post','ETH-Bereich'].includes(node.code)||(node.kind==='federal_related'&&node.parentId==='context:public'));
  await evaluate("document.querySelector('.org-home').click()");
  await waitFor(`document.querySelectorAll('.org-overview-card').length===${overviewNodes.length}&&!document.querySelector('.org-core,.org-bubble,.org-bubble-halo,.org-satellite')`,'overview must show peer organizations without a central department');
  const overviewIds=await evaluate("[...document.querySelectorAll('.org-overview-card')].map(node=>node.dataset.organizationId).sort()");
  invariant(JSON.stringify(overviewIds)===JSON.stringify(overviewNodes.map(node=>node.id).sort()),'overview omitted or duplicated a top-level organization');
  invariant(['efd','vbs','context:cantons','context:banks'].every(id=>overviewIds.includes(id)),'overview lacks departments, cantons or cantonal banks');
  await waitFor("document.querySelectorAll('.org-thread').length>0",'overview must project existing cross-organization relationships');
  await capturePageSegmentScreenshot('.organization-explorer','organization-overview-desktop.png',1440,1000);
  await evaluate("document.querySelector('.org-layer [role=switch]').click()");
  await waitFor("document.querySelectorAll('.org-domain-bubble').length>0",'overview domain layer missing');
  invariant(await evaluate("[...document.querySelectorAll('.org-domain-bubble')].every(node=>Math.abs(node.getBoundingClientRect().width-node.getBoundingClientRect().height)<2&&getComputedStyle(node).borderRadius==='50%')"),'overview domains must remain round');
  await capturePageSegmentScreenshot('.organization-explorer','organization-overview-domains.png',1440,1000);
  await evaluate("document.querySelector('.org-layer [role=switch]').click();document.querySelector('[data-organization-id=\"context:cantons\"]').click()");
  await waitFor("document.querySelector('.org-focus')?.textContent.includes('Kantone')&&document.querySelectorAll('.org-office').length>0",'overview did not drill into the canton group');
  await evaluate("document.querySelector('.org-home').click();document.querySelector('.org-own-home').click()");
  await waitFor("document.querySelector('.org-focus')?.textContent.includes('EFD')",'own area did not return from the overview');
  invariant(await evaluate("(()=>{const canvas=document.querySelector('daca-organization-canvas').getBoundingClientRect(),search=document.querySelector('.welcome-workspace .welcome-search').getBoundingClientRect();return search.left>=canvas.right-2&&search.right<=innerWidth;})()"),'search is not aligned at the right of the canvas');
  invariant(await evaluate("document.querySelector('.welcome-context').textContent.includes('V, armasuisse, ASTRA, ESTV und BIT')&&!document.querySelector('.welcome-context').textContent.includes('PoC Data Catalog')"),'welcome credit or duplicate PoC wording is wrong');
  invariant(await evaluate("document.querySelectorAll('.org-thread').length>0"),'existing catalog relationships have no thread');
  await evaluate("document.querySelector('.welcome-intro-dismiss').focus()");
  await waitFor("(()=>{const button=document.querySelector('.welcome-intro-dismiss'),tooltip=document.getElementById(button.getAttribute('aria-describedby'));return !button.hasAttribute('title')&&tooltip?.classList.contains('daca-glossary-tooltip')&&tooltip.textContent.includes('Einstellungen \u2192 Startseite');})()",'shared welcome tooltip or restoration hint missing');
  await captureScreenshot('welcome-shared-tooltip.png');
  await pressKey('Escape','Escape',27);
  await evaluate("document.activeElement?.blur()");
  invariant(await evaluate("document.querySelectorAll('.org-geometry ellipse').length===0&&document.querySelectorAll('.org-geometry rect').length===2&&getComputedStyle(document.querySelector('.org-satellite')).borderRadius===getComputedStyle(document.querySelector('.org-office')).borderRadius"),'organizations do not share the rounded rectangle shape');
  const beforeDrift=await evaluate("['.org-office','.org-satellite'].map(selector=>getComputedStyle(document.querySelector(selector)).translate)");
  await sleep(1200);
  const afterDrift=await evaluate("['.org-office','.org-satellite'].map(selector=>getComputedStyle(document.querySelector(selector)).translate)");
  invariant(beforeDrift.every((position,index)=>position!==afterDrift[index]),'inside/outside organizations are not both floating');
  const officeClearance=await evaluate("(()=>{const cards=[...document.querySelectorAll('.org-office')].map(node=>({id:node.dataset.organizationId,...node.getBoundingClientRect().toJSON()}));return {irregular:new Set(cards.map(r=>Math.round(r.top))).size>cards.length/2,overlaps:cards.flatMap((a,i)=>cards.slice(i+1).filter(b=>!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)).map(b=>[a,b]))};})()");
  invariant(officeClearance.irregular&&!officeClearance.overlaps.length,'office cards overlap or remain in geometric rows: '+JSON.stringify(officeClearance));
  await capturePageSegmentScreenshot('.welcome-workspace','organization-home-desktop.png',1440,900);
  await evaluate("document.querySelector('.welcome-intro-dismiss').click()");
  await waitFor("document.querySelector('.welcome-intro-confirm').open",'welcome confirmation did not open');
  await clickText('.welcome-intro-confirm button','Abbrechen');
  invariant(await evaluate("!!document.querySelector('.welcome-intro')"),'cancel hid the welcome');
  await evaluate("document.querySelector('.welcome-intro-dismiss').click()");
  await clickText('.welcome-intro-confirm button','Ja, ausblenden');
  await waitFor("!document.querySelector('.welcome-intro')&&!!document.querySelector('#catalog-search')&&!!document.querySelector('.org-stage')",'confirmed dismissal removed the canvas/search or retained the intro');
  await navigate('/',actor,1440,1000);
  await waitFor("document.querySelector('.org-stage')&&!document.querySelector('.welcome-intro')",'welcome visibility was not persisted');
  await waitFor("!document.querySelector('.org-domain-bubble')&&document.querySelector('.org-layer [aria-checked=false]')",'domains must start hidden after reopening the data landscape');
  await clickText('.org-office','ESTV');
  await waitFor("document.querySelector('.org-focus').textContent.includes('ESTV')&&[...document.querySelectorAll('.org-office')].some(node=>node.textContent.includes('BI'))",'ESTV unit drill-down failed');
  const assertFocusedTitlePorts=async(expected=3)=>{
    await waitFor(`(()=>{const stage=document.querySelector('.org-stage').getBoundingClientRect(),title=document.querySelector('.org-focus-title').getBoundingClientRect();const cx=(title.left+title.width/2-stage.left)/stage.width*960,cy=(title.top+title.height/2-stage.top)/stage.height*650,hx=(title.width/2+6)/stage.width*960,hy=(title.height/2+6)/stage.height*650;const atTitle=(x,y)=>Math.abs(Math.max(Math.abs(x-cx)/hx,Math.abs(y-cy)/hy)-1)<.03;return [...document.querySelectorAll('.org-thread')].filter(line=>{const a=line.getPointAtLength(0),b=line.getPointAtLength(line.getTotalLength());return atTitle(a.x,a.y)||atTitle(b.x,b.y);}).length>=${expected};})()`,'direct organization relationships do not attach to the title perimeter');
    invariant(await evaluate("[...document.querySelectorAll('.org-thread')].every(line=>[line.getPointAtLength(0),line.getPointAtLength(line.getTotalLength())].every(point=>!(point.x===480&&point.y===325)))"),'a direct relationship still ends in the empty organization center');
  };
  await assertFocusedTitlePorts();
  await capturePageSegmentScreenshot('.organization-explorer','organization-title-ports.png',1440,1000);
  await evaluate("document.querySelector('.org-fullscreen').click()");
  await waitFor("document.querySelector('.organization-explorer.is-fullscreen')",'title-port fullscreen missing');
  await assertFocusedTitlePorts();
  await capturePageSegmentScreenshot('.organization-explorer','organization-title-ports-fullscreen.png',1440,1000);
  await pressKey('Escape','Escape',27);
  await waitFor("!document.querySelector('.organization-explorer.is-fullscreen')",'title-port check did not exit fullscreen');
  await clickText('.org-office','BI');
  await waitFor("document.querySelector('.org-focus').textContent.includes('Business Intelligence')",'BI drill-down failed');
  await clickText('.org-breadcrumb button','EFD');
  await evaluate("document.querySelector('.org-layer [role=switch]').click()");
  await waitFor("document.querySelector('.org-domains')",'domain layer did not switch on');
  await waitFor("document.querySelector('.org-domain-bubble')",'enabled domains did not render bubbles');
  invariant(await evaluate("[...document.querySelectorAll('.org-domain-bubble')].every(node=>{const rect=node.getBoundingClientRect();return Math.abs(rect.width-rect.height)<1&&getComputedStyle(node).borderRadius==='50%';})"),'domain bubbles are not round');
  await waitFor("document.querySelectorAll('.org-domain-thread').length>0",'domain assignment lines missing');
  invariant(await evaluate("[...document.querySelectorAll('.org-domain-thread')].every(line=>getComputedStyle(line).strokeDasharray!=='none')"),'domain assignment lines must be dashed');
  invariant(await evaluate("document.querySelector('.org-thread:not(.is-inferred)')&&[...document.querySelectorAll('.org-thread:not(.is-inferred)')].every(line=>getComputedStyle(line).strokeDasharray==='none')"),'organization relationship lines must remain solid');
  await capturePageSegmentScreenshot('.welcome-workspace','organization-round-domains.png',1440,900);
  await evaluate("document.querySelector('.org-fullscreen').click()");
  await waitFor("document.querySelector('.organization-explorer.is-fullscreen .org-domain-thread')",'domain assignments missing in fullscreen');
  invariant(await evaluate("[...document.querySelectorAll('.org-domain-thread')].every(line=>getComputedStyle(line).strokeDasharray!=='none')"),'fullscreen domain assignments must be dashed');
  await capturePageSegmentScreenshot('.organization-explorer','organization-domain-lines-fullscreen.png',1440,1000);
  await pressKey('Escape','Escape',27);
  await waitFor("!document.querySelector('.organization-explorer.is-fullscreen')",'domain line check did not exit fullscreen');


  await evaluate("document.querySelector('.org-layer [role=switch]').click()");
  await waitFor("!document.querySelector('.org-domains')&&!document.querySelector('.org-domain-thread')",'domain layer and assignment lines did not switch off');
  await evaluate("(()=>{const node=[...document.querySelectorAll('.org-office')].find(node=>node.textContent.includes('ESTV'));node.focus();node.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',code:'F10',shiftKey:true,bubbles:true,cancelable:true}));})()");
  await waitFor("document.querySelector('.org-context-menu')",'keyboard context menu missing');
  invariant(await evaluate("document.querySelectorAll('.org-context-menu a[href]').length>=2&&!document.querySelector('.org-context-menu a[target=\"_blank\"]')"),'context menu lacks native new-tab links');
  await waitFor("[...document.querySelectorAll('.org-context-menu daca-search-icon')].every(icon=>performance.getEntriesByType('resource').some(resource=>resource.name.endsWith('/assets/catalog-search/'+icon.getAttribute('name')+'.svg')))",'menu icons did not load');
  await settleFrames();

  invariant(await evaluate("(()=>{const menu=document.querySelector('.org-context-menu'),items=[...menu.querySelectorAll('[role=menuitem]')],r=menu.getBoundingClientRect();return menu.classList.contains('daca-canvas-context-menu')&&getComputedStyle(menu).borderRadius==='8px'&&items.every(item=>item.querySelector('daca-search-icon')&&item.querySelector('span')&&getComputedStyle(item).display==='flex'&&parseFloat(getComputedStyle(item).minHeight)>=34)&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"),'organization menu does not match the shared canvas design or overflows the screen');
  await capturePageSegmentScreenshot('.welcome-workspace','organization-context-menu.png',1440,900);
  await pressKey('Escape','Escape',27);
  await waitFor("!document.querySelector('.org-context-menu')",'Escape did not close the menu');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  invariant(await evaluate("[...document.querySelectorAll('.org-satellite,.org-office,.org-domain-bubble')].every(node=>getComputedStyle(node).animationName==='none')"),'satellites animate under reduced motion');
  await evaluate("document.documentElement.dataset.dacaTheme='dark'");
  await capturePageSegmentScreenshot('.welcome-workspace','organization-dark.png',1440,900);
  await evaluate("document.documentElement.dataset.dacaTheme='light'");
  await setViewport(390,844); await settleFrames();
  await waitFor("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.org-viewport').scrollLeft>100",'mobile organization layout did not settle');
  const mobileBounds=await evaluate("(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,x:scrollX,parts:['.welcome-page','.welcome-workspace','.org-viewport','.org-stage','.org-core','.org-context-menu'].map(selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return{selector,left:r?.left,right:r?.right,width:r?.width,scroll:e?.scrollWidth};})}))()");
  await captureScreenshot('organization-mobile-check.png');
  invariant(mobileBounds.scroll<=mobileBounds.width+1,`organization canvas overflows the mobile page: ${JSON.stringify(mobileBounds)}`);
  invariant(await evaluate("document.querySelector('.org-viewport').scrollWidth>document.querySelector('.org-viewport').clientWidth"),'mobile canvas has no local scrolling');
  invariant(await evaluate("document.querySelector('.org-viewport').scrollLeft>100"),'mobile canvas did not center the home department');
  await captureScreenshot('organization-mobile.png');
  await evaluate("(()=>{const node=document.querySelector('.org-office');node.focus();node.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',code:'F10',shiftKey:true,bubbles:true,cancelable:true}));})()");
  await waitFor("document.querySelector('.org-context-menu')",'mobile keyboard context menu missing');
  await settleFrames();
  invariant(await evaluate("(()=>{const menu=document.querySelector('.org-context-menu').getBoundingClientRect();return menu.left>=0&&menu.right<=innerWidth&&menu.top>=0;})()"),'mobile context menu is clipped after canvas centering');
  await pressKey('Escape','Escape',27);
  await waitFor("!document.querySelector('.org-context-menu')",'mobile Escape did not close the menu');

  await navigate('/?organization=all',actor,390,844);
  await waitFor(`document.querySelectorAll('.org-overview-card').length===${overviewNodes.length}&&!document.querySelector('.org-core,.org-bubble')`,'overview deep link did not load on mobile');
  invariant(await evaluate("document.documentElement.scrollWidth<=innerWidth+2&&document.querySelector('.org-viewport').scrollWidth>document.querySelector('.org-viewport').clientWidth"),'mobile overview must scroll locally without page overflow');
  await capturePageSegmentScreenshot('.organization-explorer','organization-overview-mobile.png',390,850);
  await evaluate("document.querySelector('.org-own-home').click()");
  await waitFor("document.querySelector('.org-focus')?.textContent.includes('EFD')",'mobile own-area return failed');
  await evaluate("(()=>{const card=document.querySelector('.org-office');card.focus();card.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',code:'F10',shiftKey:true,bubbles:true,cancelable:true}));})()");
  await waitFor("document.querySelector('.org-context-menu')",'mobile organization menu missing');await settleFrames();
  await waitFor("(()=>{const r=document.querySelector('.org-context-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()",'mobile organization menu overflows the screen');
  await captureScreenshot('organization-context-menu-mobile.png');
  await pressKey('Escape','Escape',27);


  await navigate('/settings/home',actor);
  await clickText('.settings-panel button','Willkommensbereich wieder anzeigen');
  await navigate('/',actor);
  await waitFor("document.querySelector('.welcome-intro')&&document.querySelector('.org-stage')",'settings did not restore the welcome introduction');
  await navigate('/?organization=vbs','sibilla.micheli',1440,1000);
  await waitFor("document.querySelector('.org-focus')?.textContent.includes('VBS')&&document.querySelectorAll('.org-office').length>8",'VBS free office layout missing');
  invariant(await evaluate(`document.querySelector('.org-satellite[data-organization-id="${sg.id}"]')?.classList.contains('is-connected')`),'St. Gallen must remain bright when supplying armasuisse inside VBS');
  await evaluate(`document.querySelector('.org-satellite[data-organization-id="${sg.id}"]').click()`);
  await waitFor("document.querySelector('.org-focus')?.textContent.includes('St. Gallen')",'cannot drill into the Zeughaus producer canton');
  invariant(await evaluate("document.querySelector('.org-focus .org-canton-prefix')?.textContent==='Kanton'&&document.querySelector('.org-satellite[data-organization-id=\"vbs-armasuisse\"]')?.classList.contains('is-connected')"),'outbound canton relationship is not highlighted');
  await assertFocusedTitlePorts(2);
  await capturePageSegmentScreenshot('.organization-explorer','organization-st-gallen-armasuisse.png',1440,1000);
  await evaluate("document.querySelector('.org-own-home').click()");
  await waitFor("document.querySelector('.org-focus')?.textContent.includes('VBS')",'return to VBS failed');
  await waitFor("document.querySelector('a[href=\"/profile\"]')?.textContent.includes('Sibilla Di Ciesa')",'renamed Sibilla profile label missing');
  await capturePageSegmentScreenshot('.welcome-workspace','organization-vbs-free-layout.png',1440,900);
  await navigate('/profile','fausto.marzo',1440,1000);
  await waitFor("(()=>{const image=document.querySelector('img.profile-portrait');return image?.src.endsWith('/assets/data-owners/fausto-marzo.webp')&&image.complete&&image.naturalWidth===256;})()",'Fausto portrait is not loaded in his profile');
  await waitFor("(()=>{const profile=document.querySelector('daca-user-profile')?.textContent??'';return profile.includes('EFD BIT PS')&&!profile.includes('EFD BIT PS CPS');})()",'Fausto organization must be PS without CPS');
  await captureScreenshot('fausto-profile-portrait.png');
  for(const [person,name,organization,role] of [
    ['sibilla.micheli','Sibilla Di Ciesa','VBS GS','Local Data Steward Department (LDSD)'],
    ['christian.spider','Christiano Stadello','VBS armasuisse','Amt Local Data Steward (ALDS)'],
    ['thomas.wikinger','Thomas Wikinger','VBS armasuisse','Local Data Steward (LDS)'],
    ['thomas.kriegli','Thomas Kriegli','EFD ESTV BI','Amt Local Data Steward (ALDS)'],
    ['joel.ruod','Joel Ruod','EFD ESTV BI','Stellvertretung'],
  ]){
    await navigate('/profile',person,1440,1000);
    await waitFor(`document.querySelector('#profile-name')?.textContent===${JSON.stringify(name)}&&document.querySelector('.profile-identity')?.textContent.includes(${JSON.stringify(organization)})&&document.querySelector('daca-user-profile')?.textContent.includes(${JSON.stringify(role)})`,'confirmed persona scope or mandate missing: '+person);
    await captureScreenshot('profile-'+person.replaceAll('.','-')+'.png');
    if(person==='sibilla.micheli')await captureScreenshot('journey-09-sibilla-profile.webp');
  }
  const domains=expectStatus(await api('thomas.kriegli','/api/v1/domains'),200,'read analytics domains').body;
  invariant(domains.some(domain=>domain.localizations.some(label=>label.preferredLabel==='Data Analytics')&&domain.ownerUserId==='thomas.kriegli'),'Thomas must own Data Analytics');
  await navigate('/domains?ownOffice=0&view=cards','sandro.wenger',1440,1100);
  await setControls({'.semantic-search input':'Verteidigung'});
  await waitFor("document.querySelector('.semantic-grid')?.textContent.includes('Sibilla Di Ciesa')",'current domain responsibility missing from guide evidence');
  await captureScreenshot('journey-08-domain-register.webp');
  invariant(cdp.runtimeExceptions.length===0,`organization explorer browser errors: ${JSON.stringify(cdp.runtimeExceptions)}`);
  console.log('PASS organization-explorer: trusted hierarchy, NE relationship, right search, confirmed browser-local hide/reload/restore, EFD/ESTV/BI, domain layer, keyboard context links, dark/reduced-motion and 390px layout');
  } finally {
    await cdp.call('Fetch.disable',{},sessionId);
    cdp.mockReadResponses=null;
  }
}

try {
  const browser = await connectBrowser();
  cdp = new CdpClient(browser.webSocketDebuggerUrl);
  await cdp.ready;
  const target = await cdp.call('Target.createTarget', { url: 'about:blank' });
  const attached = await cdp.call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await cdp.call('Page.enable', {}, sessionId);
  await cdp.call('Page.setLifecycleEventsEnabled', {enabled:true}, sessionId);
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
    source: `try {
      const user = new URL(location.href).searchParams.get('demoUser');
      if (user && ${JSON.stringify(args.get('--flow') !== 'organization-localization')}) localStorage.setItem('daca.preference.' + user + '.language', 'de');
    } catch {}`,
  }, sessionId);
  await cdp.call('Runtime.enable', {}, sessionId);
  // Keep keyboard interaction in this headless page even after a download or an external browser gains focus.
  await cdp.call('Emulation.setFocusEmulationEnabled', {enabled:true}, sessionId);
  await cdp.call('Network.enable', {}, sessionId);
  await cdp.call('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.call('Network.setBypassServiceWorker', { bypass: true }, sessionId);

  if(args.get('--flow')==='customer-modeling-fixes'){await customerModelingFixesFlow();} else if(args.get('--flow')==='context-menu-navigation'){await contextMenuNavigationFlow();} else
  if(args.get('--flow')==='requester-decision'){await requesterDecisionFlow();} else
  if(args.get('--flow')==='product-access-request'){await productAccessRequestFlow(args.get('--request-end')==='indefinite',args.get('--request-product'));} else
  if(args.get('--flow')==='organization-heading-space'){await organizationHeadingSpaceFlow();} else if(args.get('--flow')==='organization-highway'){await organizationHighwayFlow();} else if(args.get('--flow')==='organization-view-options'){await organizationViewOptionsFlow();} else if(args.get('--flow')==='canvas-card-styles'){await canvasCardStylesFlow();} else if(args.get('--flow')==='canvas-selection'){await canvasSelectionFlow();} else if(args.get('--flow')==='protected-buildings'){await protectedBuildingsFlow();} else if(args.get('--flow')==='domain-product-layout'){await domainProductLayoutFlow();} else if(args.get('--flow')==='organization-flow'){await organizationFlowFlow();} else if(args.get('--flow')==='canvas-controls'){await canvasControlsFlow();} else if(args.get('--flow')==='recent-work'){await recentWorkFlow();} else if(args.get('--flow')==='organization-object-search'){await organizationObjectSearchFlow();} else if(args.get('--flow')==='organization-localization'){await organizationLocalizationFlow();} else if(args.get('--flow')==='organization-domain-layout'){await organizationDomainLayoutFlow();} else if(args.get('--flow')==='organization-layout'){await organizationLayoutFlow();} else if(args.get('--flow')==='semantic-performance'){await semanticPerformanceFlow();} else if(args.get('--flow')==='domain-radial-layout'){await domainRadialLayoutFlow();} else if(args.get('--flow')==='organization-explorer'){await organizationExplorerFlow();} else if(args.get('--flow')==='domain-exploration'){await domainExplorationFlow();} else if(args.get('--flow')==='domain-loading-indicators'){await domainLoadingIndicatorsFlow();} else if(args.get('--flow')==='physical-domain-removal'){await physicalDomainRemovalFlow();} else if(args.get('--flow')==='lineage-access'){await lineageAccessFlow();} else if(args.get('--flow')==='domain-canvas-mobile-layout'){await domainCanvasMobileLayoutFlow();} else if(args.get('--flow')==='domain-canvas-approval'){await domainCanvasApprovalFlow();} else if(args.get('--flow')==='source-info-notices'){await sourceInfoNoticesFlow();} else if(args.get('--flow')==='mapping-status-tooltips'){await mappingStatusTooltipsFlow();} else if(args.get('--flow')==='personal-search-views'){await personalSearchViewsFlow();} else if(args.get('--flow')==='lineage-explorer'){await lineageExplorerFlow();} else if(args.get('--flow')==='model-department-default'){await modelDepartmentDefaultFlow();} else if(args.get('--flow')==='physical-derivation'){await physicalDerivationEntryFlow();} else if(args.get('--flow')==='physical-object-actions'){await physicalObjectActionsFlow();} else if(args.get('--flow')==='mapping-release-tail'){await navigate('/models','christian.man');const physical=await physicalFirstFlow();await existingToExistingFlow(physical);await dataModelJourneyTen();await sourceAccessReturnFlow();await fieldMoveFlow();console.log('PASS focused Mapping release tail');} else if(args.get('--flow')==='semantic-own-office'){await semanticOwnOfficeFlow();} else if(args.get('--flow')==='mapping-start'){await mappingStartFlow();} else if(args.get('--flow')==='expert-search'){await expertSearchFlow();} else if(args.get('--flow')==='mapping-live-refresh'){await mappingLiveRefreshFlow();} else if(args.get('--flow')==='domain-transfer'){await domainTransferFlow();} else if(args.get('--flow')==='domain-metadata'){await domainMetadataFlow();} else if(args.get('--flow')==='semantic-owner-search'){await semanticOwnerSearchFlow();} else if(args.get('--flow')==='domain-relation-types'){await domainRelationTypesFlow();} else if(args.get('--flow')==='organization-term-network'){await organizationTermNetworkFlow();} else if(args.get('--flow')==='domain-connection-gesture'){await domainConnectionGestureFlow();} else if(args.get('--flow')==='domain-card-actions'){await domainCardActionsFlow();} else if(args.get('--flow')==='governance-information'){await governanceInformationFlow();} else if(args.get('--flow')==='semantic-gestures'){await semanticGestureFlow();} else if(args.get('--flow')==='domain-network'){await domainNetworkFlow();} else if(args.get('--flow')==='field-move'){await fieldMoveFlow();} else if(args.get('--flow')==='hold-connections'){await holdConnectionFlow({modelId:args.get('--model-id'),snapshotId:args.get('--snapshot-id')});} else if(args.get('--flow')==='source-access-return'){await sourceAccessReturnFlow();} else if(args.get('--flow')==='csv-import'){await csvPhysicalModelsFlow();} else if(args.get('--flow')==='inventory-representation'){await inventoryRepresentationFlow();} else if(args.get('--flow')==='concept-network'){await conceptNetworkEditingFlow();} else if(args.get('--flow')==='line-editing'){
    invariant(args.get('--model-id')&&args.get('--snapshot-id'),'line-editing flow requires model-id and snapshot-id');
    await edgeEditingFlow({modelId:args.get('--model-id'),snapshotId:args.get('--snapshot-id')});
  } else {
  await productAccessRequestFlow();
  await productAccessRequestFlow(true);
  await requesterDecisionFlow();
  await contextMenuNavigationFlow();
  await adaImportJourneyFlow();
  await csvPhysicalModelsFlow();
  await customerModelingFixesFlow();
  await inventoryRepresentationFlow();
  const logical = await logicalFirstFlow();
  console.log(`PASS logical-first: ${logical.modelId}`);
  const physical = await physicalFirstFlow();
  await edgeEditingFlow(physical);
  await holdConnectionFlow(physical);
  console.log(`PASS physical-first: ${physical.modelId} @ ${physical.snapshotId}`);
  const domainAssignment = await domainAssignmentFlow(physical);
  console.log(`PASS domain-assignment: ${domainAssignment.modelId}`);
  await personnelOntologyFlow();
  await conceptNetworkEditingFlow();
  await domainNetworkFlow();await semanticOwnerSearchFlow();await domainMetadataFlow();await domainTransferFlow();await governanceInformationFlow();await domainCardActionsFlow();
  await semanticGestureFlow();
  const existing = await existingToExistingFlow(physical);
  console.log(`PASS existing-to-existing: ${existing.mappingId} @ ${existing.currentSnapshotId}`);
  console.log(`PASS mobile: ${JSON.stringify(existing.mobile)}`);
  const journeyTen = await dataModelJourneyTen();
  console.log(`PASS journey-10: ${journeyTen.modelId}`);
  await sourceAccessReturnFlow();
  await fieldMoveFlow();
  }
} finally {
  try {
    if (cdp) await cdp.call('Browser.close');
  } catch {}
  // Windows may retain the temporary profile lock until Edge has actually exited.
  const waitForExit=async()=>{
    if(edge.exitCode!==null)return;
    await new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);edge.off('exit',done);resolve();};
      const timer=setTimeout(done,2000);edge.once('exit',done);
    });
  };
  await waitForExit();
  if (edge.exitCode===null&&!edge.killed) { edge.kill(); await waitForExit(); }
  const temporaryRoot = path.resolve(tmpdir());
  const resolvedProfile = path.resolve(profileDirectory);
  if (resolvedProfile.startsWith(`${temporaryRoot}${path.sep}daca-edge-e2e-`)) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 });
  }
}

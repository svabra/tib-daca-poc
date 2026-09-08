#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = (args.get('--base-url') ?? 'http://127.0.0.1:4200').replace(/\/$/, '');
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
      this.pending.set(id, { method, resolve, reject });
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

async function logicalFirstFlow() {
  const title = `Edge QA Mitarbeitende ${Date.now()}`;
  await navigate('/models/new', 'cinthya.thor');
  await waitFor(
    "document.querySelector('input[formcontrolname=\"titleDe\"]') !== null",
    'logical-model editor did not finish loading',
  );
  const reference = expectStatus(
    await api('cinthya.thor', '/api/v1/logical-models/70d964d8-334c-50bc-9177-88e3dbfba28f'),
    200,
    'load logical-first reference',
  ).body;
  await waitFor(
    "[...document.querySelectorAll('select[formcontrolname=\"dataOwnerId\"] option')].some((item) => item.value === 'christian.spider')",
    'scoped Data Owner options did not finish loading',
  );
  await setControls({
    'input[formcontrolname="titleDe"]': title,
    'textarea[formcontrolname="descriptionDe"]': 'Browsergeprüftes logical-first Modell ohne Distribution, Produkt oder physische Quelle.',
    'input[formcontrolname="identifiers"]': `EDGE-LOGICAL-${Date.now()}`,
    'select[formcontrolname="dataDomainId"]': reference.dataDomainId,
    'select[formcontrolname="dataOwnerId"]': 'christian.spider',
    'input[formcontrolname="creatorName"]': 'Edge QA Harness',
    'select[formcontrolname="classification"]': 'internal',
    'input[formcontrolname="entityName"]': 'edge_employee',
    '.field-list input[formcontrolname="name"]': 'employee_id',
    '.field-list textarea[formcontrolname="shortDescription"]': 'Stabiler synthetischer Identifikator.',
  });
  await waitFor(
    "[...document.querySelectorAll('select[formcontrolname=\"deputyDataOwnerId\"] option')].some((item) => item.value === 'sibilla.micheli')",
    'delegated deputy options did not finish loading',
  );
  await setControls({'select[formcontrolname="deputyDataOwnerId"]': 'sibilla.micheli'});
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
  await clickText('button[type="submit"]', 'Als Entwurf speichern');
  await waitFor(
    `location.pathname.match(/^\\/models\\/[0-9a-f-]+$/) && document.body.innerText.includes(${JSON.stringify(title)})`,
    'logical-first draft was not persisted and routed to its detail page',
  );
  const modelId = await evaluate("location.pathname.split('/').pop()");
  await clickText('button', 'Zur Domänenfreigabe einreichen');
  await waitFor(
    "document.body.innerText.includes('Die Freigabe wurde vorgeschlagen')",
    'logical-first review submission did not complete',
  );
  const submitted = expectStatus(
    await api('cinthya.thor', `/api/v1/logical-models/${modelId}`),
    200,
    'read submitted logical model',
  ).body;
  const removedDirectPublish = await api(
    'cinthya.thor',
    `/api/v1/logical-models/${modelId}/versions/${submitted.versionId}/publish`,
    { method: 'POST', etag: `"${submitted.lockVersion}"` },
  );
  invariant(removedDirectPublish.status === 404, `Removed direct publish endpoint returned ${removedDirectPublish.status}`);

  await navigate(`/models/${modelId}`, 'christian.spider');
  await waitFor(
    "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Annehmen und publizieren') && !item.disabled)",
    'Domain Owner did not receive the review decision action',
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
      fields: [{name: 'infrastrukturbedarf', businessObject: 'Infrastrukturbedarf', businessObjectVersionId: need.versionId, dataType: 'xsd:string', shortDescription: 'Versionierter Infrastrukturbedarf.', classification: 'unclassified', nullable: true, minCount: 0, maxCount: 1, position: 1, conceptIds: [], primaryConceptId: null, valueListConceptId: null, conceptMatchExplicitlyNone: true}],
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

async function physicalFirstFlow() {
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
  await waitFor(
    "document.querySelector('.mapping-matrix') && document.body.innerText.includes('Gültig')",
    'validated mapping did not appear in the matrix',
  );
  await cdp.call('Page.reload', { ignoreCache: true }, sessionId);
  await waitFor(
    "document.querySelector('.mapping-matrix') && document.body.innerText.includes('Gültig')",
    'mapping did not survive an Edge reload',
  );

  await navigate('/physical-models', 'christian.man');
  await waitFor(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(physical.sourceName)}));
    const button = card?.querySelector('button');
    return Boolean(button) && !button.disabled;
  })()`, 'drift source did not become ready for a follow-up import');
  const driftImportStarted = await evaluate(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(physical.sourceName)}));
    const button = card?.querySelector('button');
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
    if (snapshots.length >= 2) break;
    await sleep(120);
  }
  invariant(snapshots.length >= 2, 'fixture drift import did not append its immutable snapshot');
  await waitFor(`(() => {
    const card = [...document.querySelectorAll('.source-card')]
      .find((item) => item.textContent.includes(${JSON.stringify(physical.sourceName)}));
    return Boolean(card) && !card.textContent.includes('Import läuft');
  })()`, 'fixture drift import remained busy in Edge');
  const currentSnapshotId = snapshots[0].id;
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
    const button = document.querySelector('.toolbar-actions button:last-child');
    button?.focus();
    return document.activeElement === button && !button.disabled;
  })()`);
  invariant(saveFocused, 'workspace draft save is not keyboard-submittable');
  await pressKey('Enter', 'Enter', 13);
  await waitFor(
    "document.body.innerText.includes('versioniert gespeichert')",
    'drift resolution successor was not persisted',
  );
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
  await waitFor("document.querySelector('.mapping-matrix') !== null", 'desktop matrix did not render');
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
  await cdp.call('Runtime.enable', {}, sessionId);
  await cdp.call('Network.enable', {}, sessionId);
  await cdp.call('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.call('Network.setBypassServiceWorker', { bypass: true }, sessionId);

  const logical = await logicalFirstFlow();
  console.log(`PASS logical-first: ${logical.modelId}`);
  const physical = await physicalFirstFlow();
  console.log(`PASS physical-first: ${physical.modelId} @ ${physical.snapshotId}`);
  const existing = await existingToExistingFlow(physical);
  console.log(`PASS existing-to-existing: ${existing.mappingId} @ ${existing.currentSnapshotId}`);
  console.log(`PASS mobile: ${JSON.stringify(existing.mobile)}`);
  const journeyTen = await dataModelJourneyTen();
  console.log(`PASS journey-10: ${journeyTen.modelId}`);
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

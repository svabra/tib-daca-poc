import { PocGuideCapability, PocGuideStatus, PocJourney } from './poc-guide.models';

const IMAGE_ROOT = '/assets/poc-guide';
const DATA_ANALYST_JOURNEY_PRODUCT_ID = '3a2930ed-3eee-599b-82b5-e138b149d1a2';

export const POC_GUIDE_STATUS_LABELS: Readonly<Record<PocGuideStatus, string>> = {
  implemented: 'Technisch umgesetzt',
  simulation: 'PoC-Simulation',
  'out-of-scope': 'Nicht Teil des PoC',
};

export const POC_GUIDE_CAPABILITIES: readonly PocGuideCapability[] = [
  {
    title: 'Datenprodukte finden und verstehen',
    description: 'Katalogsuche, Metadaten, Schnittstellen, Lineage und Provenienz sind direkt im DaCa sichtbar.',
    status: 'implemented',
  },
  {
    title: 'Metadaten aus DAAIF übernehmen',
    description: 'DAAIF meldet Metadaten und den REST-Endpunkt. Nutzdaten und Zugangsdaten werden nicht kopiert.',
    status: 'implemented',
  },
  {
    title: 'Zugriffe prüfen und technisch durchsetzen',
    description: 'Policy-Entwürfe, Vier-Augen-Freigabe, OPA-Entscheide und der geschützte REST-Endpunkt sind wirksam.',
    status: 'implemented',
  },
  {
    title: 'Änderungen und Entscheidungen nachvollziehen',
    description: 'Der echte Produktverlauf verbindet Metadaten, Qualität, Freigaben und technische Aktivierung in einer rollenabhängig geschützten Timeline.',
    status: 'implemented',
  },
  {
    title: 'I14Y und BAR nachvollziehbar konfigurieren',
    description: 'I14Y erzeugt im PoC eine simulierte Outbox; BAR speichert Evidenz, startet aber keinen Archivierungsauftrag.',
    status: 'simulation',
  },
];

export const POC_GUIDE_LIMITS: readonly PocGuideCapability[] = [
  {
    title: 'Keine echte Anmeldung',
    description: 'Die sichtbare Benutzerauswahl ist nur ein Demo-Kontext und ersetzt weder eIAM noch eine Mandantentrennung.',
    status: 'out-of-scope',
  },
  {
    title: 'Keine produktiven Fachdaten',
    description: 'Alle Journey-Daten und Identitäten sind synthetisch und dürfen nicht als amtliche Statistik verwendet werden.',
    status: 'out-of-scope',
  },
  {
    title: 'Keine aktive Katalogföderation',
    description: 'Das Control Plane und echter Katalogverkehr sind im präsentierten RHOS-Umfang nicht aktiv.',
    status: 'out-of-scope',
  },
  {
    title: 'Keine Produktionsfreigabe',
    description: 'Der PoC ersetzt keine Datenschutz-, Sicherheits-, Archivierungs- oder Betriebsfreigabe.',
    status: 'out-of-scope',
  },
];

export const POC_JOURNEYS: readonly PocJourney[] = [
  {
    id: 'understand-and-use-product',
    number: '01',
    title: 'Datenprodukt finden, verstehen und nutzen',
    summary: 'Ein publiziertes Datenprodukt fachlich einordnen, sein Datenschema lesen und den geschützten REST-Endpunkt sicher ausprobieren.',
    duration: '8–12 Minuten',
    difficulty: 'Einfach',
    systems: ['DaCa', 'DAAIF REST'],
    roles: [
      { name: 'Beat Stalder', responsibility: 'Data Consumer · Kanton St. Gallen' },
      { name: 'Joel Ruod', responsibility: 'Data Owner und fachlicher Ansprechpartner' },
    ],
    prerequisites: [
      'A Data Analyst’s Journey wurde abgeschlossen; das Gewerbesteuer-Datenprodukt ist aktiv und auffindbar.',
      'Beat Stalder besitzt eine aktive Freigabe für Montag bis Freitag, 07:00–19:00 Uhr Europe/Zurich.',
      'DaCa und der von DAAIF bereitgestellte REST-Endpunkt sind erreichbar.',
    ],
    outcome: 'Beat versteht Inhalt, Qualität und Schlüssel des Datenprodukts und kann den registrierten REST-Endpunkt mit einem sicheren Quickstart selbst verwenden.',
    repeatability: 'Die Journey ist vollständig read-only und beliebig wiederholbar. Sie verändert weder Metadaten noch Freigaben oder Produktdaten; ein Reset ist nicht nötig.',
    steps: [
      {
        title: 'Datenprodukt als Beat finden',
        description: 'Öffnen Sie die Expertensuche als Beat und suchen Sie nach «Gewerbesteuer». Wählen Sie das Produkt «Kantonale Gewerbesteuer: Soll/Ist und Jahreshochrechnung 2022–2026».',
        status: 'implemented',
        actions: [{
          label: 'Nach Gewerbesteuer suchen',
          target: 'internal',
          path: '/search',
          demoUserId: 'beat.stalder',
          queryParams: { q: 'Gewerbesteuer' },
        }],
        checkpoint: 'Das Produkt ist auffindbar und als publiziertes DAAIF-Datenprodukt erkennbar.',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-product-search.webp`,
          alt: 'DaCa Expertensuche als Beat Stalder mit dem gefundenen Gewerbesteuer-Datenprodukt aus DAAIF.',
          caption: 'Die Katalogsuche führt Beat zum publizierten Produkt, ohne ihm dadurch automatisch Zugriff auf dessen Daten zu geben.',
        }],
      },
      {
        title: 'Produktkontext und Qualität prüfen',
        description: 'Öffnen Sie die Übersicht. Prüfen Sie Titel, Beschreibung, Data Owner Joel Ruod, Klassifikation, Revision und die Qualitätsmedaille Platinum.',
        status: 'implemented',
        actions: [{
          label: 'Produktübersicht öffnen',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/overview`,
          demoUserId: 'beat.stalder',
        }],
        checkpoint: 'Die Übersicht nennt 6 von 6 erfüllte Qualitätsbedingungen und Joel als verantwortlichen Data Owner.',
      },
      {
        title: 'Datenwörterbuch lesen',
        description: 'Öffnen Sie «Daten & Nutzung». Lesen Sie die fachlichen Beschreibungen, Datentypen und Nullable-Angaben der 18 Felder. Achten Sie besonders auf die Schlüssel canton_code und tax_year.',
        status: 'implemented',
        actions: [{
          label: 'Zum Datenwörterbuch',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/usage`,
          demoUserId: 'beat.stalder',
          fragment: 'data-dictionary',
        }],
        checkpoint: 'Beat kann erklären, was eine Zeile repräsentiert und welche Felder einen Datensatz fachlich identifizieren.',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-data-dictionary.webp`,
          alt: 'DaCa Datenwörterbuch des Gewerbesteuer-Datenprodukts mit Feldnamen, Datentypen und fachlichen Beschreibungen.',
          caption: 'Das Datenwörterbuch übersetzt das technisch gelieferte Schema in eine für Data Consumer verständliche Feldübersicht.',
        }],
      },
      {
        title: 'REST-Quickstart vorbereiten',
        description: 'Prüfen Sie im Endpoint-Quickstart Methode, registrierte URL und Antwortformat. Kopieren Sie wahlweise nur die URL oder den vorbereiteten curl-Aufruf für Beat.',
        status: 'implemented',
        actions: [{
          label: 'Zum Endpoint-Quickstart',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/usage`,
          demoUserId: 'beat.stalder',
          fragment: 'endpoint-quickstart',
        }],
        warning: 'Verwenden Sie die im Katalog registrierte URL. Eine localhost- oder interne Service-Adresse ist nur in der dazugehörigen Umgebung erreichbar.',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-endpoint-quickstart.webp`,
          alt: 'DaCa Endpoint-Quickstart mit registrierter REST-Adresse, Antwortformat und kopierbarem curl-Beispiel für Beat Stalder.',
          caption: 'Der Quickstart zeigt ausschliesslich konsumierbare Verbindungsangaben und niemals Tokens, Passwörter oder interne Secret-Referenzen.',
        }],
      },
      {
        title: 'Zugriff am echten Endpoint prüfen',
        description: 'Führen Sie den kopierten Aufruf innerhalb des Freigabefensters aus. Beat erhält HTTP 200 und paginierte Daten. Ohne Identitätsheader gilt 401; eine nicht berechtigte Identität erhält 403.',
        status: 'implemented',
        checkpoint: 'Die Antwort enthält Spalten, maximal 100 Einträge der ersten Seite sowie limit, offset und hasMore.',
        warning: 'Ein sichtbarer Katalogeintrag ist keine Datenfreigabe. Den HTTP-Status entscheidet die publizierte Policy zur Laufzeit.',
      },
      {
        title: 'Fachliche Nutzung einordnen',
        description: 'Vergleichen Sie das Datenwörterbuch mit der REST-Antwort und klären Sie offene Bedeutungsfragen mit Joel. Halten Sie fest, dass die Daten synthetisch sind und der PoC keine produktive Nutzungsfreigabe ersetzt.',
        status: 'implemented',
        checkpoint: 'Beat kennt Dateninhalt, Schlüssel, Ansprechpartner, technische Nutzung und die Grenze zwischen Metadatensichtbarkeit und Datenzugriff.',
      },
    ],
  },
  {
    id: 'data-analysts-journey',
    number: '02',
    title: 'A Data Analyst’s Journey',
    summary: 'Vom synthetischen Rohdatensatz über SQL und Python zum geprüften, OPA-geschützten REST-Datenprodukt.',
    duration: '25–35 Minuten',
    difficulty: 'Fortgeschritten',
    systems: ['DAAIF', 'DaCa', 'OPA'],
    roles: [
      { name: 'Joel Ruod', responsibility: 'Data Analyst und Data Owner' },
      { name: 'Thomas Kriegli', responsibility: 'Publication Approver' },
      { name: 'Beat Stalder', responsibility: 'Data Consumer · Kanton St. Gallen' },
      { name: 'Daniel Aebischer', responsibility: 'Data Consumer · Bundestresorerie' },
    ],
    prerequisites: [
      'DAAIF ist erreichbar und der Journey-Loader wurde noch nicht bereinigt.',
      'DaCa Catalog API, Sample Data Product und OPA sind bereit.',
      'Der DAAIF-Publish-Preview zeigt ein Relation-Schema mit mindestens einem Feld.',
    ],
    outcome: 'Ein in DaCa freigegebenes Datenprodukt, dessen DAAIF-REST-Endpunkt nur berechtigten Personen innerhalb der Bürozeiten Daten liefert.',
    repeatability: 'Die stabile Produktidentität wird bei Wiederholungen über den DAAIF-Overwrite-/Replay-Pfad weiterverwendet. Es gibt keinen globalen Cross-App-Reset.',
    verification: {
      label: 'Durchgängig verifiziert',
      detail: 'Cross-App-Smoke bestanden: DAAIF liefert ein Relation-Schema, DaCa führt das Produkt aktiv und auffindbar, der REST-Endpunkt antwortet mit 401, 403 und 200 wie vorgesehen.',
    },
    steps: [
      {
        title: 'DAAIF als Joel öffnen',
        description: 'Öffnen Sie das unveränderbare Journey-Notebook. Prüfen Sie im Demo-Benutzermenü, dass Joel Ruod ausgewählt ist.',
        status: 'implemented',
        actions: [
          { label: 'Journey-Notebook in DAAIF öffnen', target: 'daaif-notebook' },
          { label: 'Journey-Loader in DAAIF öffnen', target: 'daaif-loader' },
        ],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-daaif-loader.webp`,
          alt: 'DAAIF Loader Workbench mit dem Loader A Data Analyst’s Journey und dem Zielpfad der Aargau CSV-Datei.',
          caption: 'Der Loader erzeugt die elektronischen Kantonsdaten und stellt die manuell einzulesende Aargau-Datei bereit.',
        }],
      },
      {
        title: 'Elektronische Kantonsdaten erzeugen',
        description: 'Starten Sie «a Data Analyst’s Journey». Der Loader schreibt 25 Parquet-Dateien nach S3 und 1’500 kuratierte Zeilen nach PostgreSQL.',
        status: 'implemented',
        checkpoint: 'Der Loader-Job ist abgeschlossen und meldet 25 Dateien sowie 1’500 PostgreSQL-Zeilen.',
      },
      {
        title: 'Aargau bewusst als Plain CSV einlesen',
        description: 'Laden Sie die bereitgestellte Datei herunter. Im Ingestion Workbench bleibt das Format «Plain CSV». Ziel: Bucket «data-analysts-journey», Prefix «manual/aargau», unveränderter Dateiname.',
        status: 'implemented',
        warning: 'Nicht nach Parquet konvertieren: Zelle 1 liest genau die rohe CSV-Datei vom kanonischen S3-Pfad.',
      },
      {
        title: 'SQL-UNION und Parquet-Materialisierung ausführen',
        description: 'Zelle 1 vereinigt PostgreSQL und Aargau-CSV mit UNION ALL, aggregiert 26 Kantone über fünf Jahre und speichert 130 Zeilen automatisch als kanonisches Parquet.',
        status: 'implemented',
        checkpoint: 'Result Storage zeigt s3://data-analysts-journey/products/kantonale-gewerbesteuer-soll-ist-2022-2026.parquet und genau 130 Ergebniszeilen.',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-daaif-notebook.webp`,
          alt: 'DAAIF SQL-Notebook mit aktiviertem Result Storage und dem kanonischen Parquet-Pfad.',
          caption: 'Das Datenprodukt wird bereits während der SQL-Ausführung am vereinbarten Ort materialisiert.',
        }],
      },
      {
        title: 'Python-Visualisierung plausibilisieren',
        description: 'Führen Sie die zweite Zelle aus und prüfen Sie Jahresvergleich, Hochrechnung, Histogramm und den Hinweis auf synthetische Daten.',
        status: 'implemented',
      },
      {
        title: 'REST-Datenprodukt an DaCa melden',
        description: 'Öffnen Sie den geführten Publish-Dialog am materialisierten Resultat. «Publish to DaCa» bleibt aktiviert. Kontrollieren Sie vor dem Publizieren, dass das Response-Schema echte Relationsfelder enthält.',
        status: 'implemented',
        warning: 'Ein binärer Raw-Object-Stream ohne Schema ist nicht der vorgesehene Journey-Publish-Pfad.',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-daaif-publish.webp`,
          alt: 'DAAIF Publish-Dialog mit Relation-Response-Schema und aktivierter Option Publish to DaCa.',
          caption: 'DAAIF sendet nur Metadaten und den REST-Endpunkt; DaCa erhält weder Parquet-Datei noch Zugangsdaten.',
        }],
      },
      {
        title: 'Qualität und Semantik in DaCa bestätigen',
        description: 'Öffnen Sie DaCa als Joel. Prüfen Sie technische Felder, Fachbeschreibungen, DCAT, Ontologiezuordnungen und Kontextgraph.',
        status: 'implemented',
        actions: [{ label: 'DaCa-Aufgaben als Joel öffnen', target: 'internal', path: '/tasks', demoUserId: 'joel.ruod' }],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-daca-quality.webp`,
          alt: 'DaCa Qualitätswizard für das aus DAAIF übernommene Gewerbesteuer-Datenprodukt.',
          caption: 'Der Data Owner bestätigt die automatisch gelieferten und vorgeschlagenen Metadaten bewusst.',
        }],
      },
      {
        title: 'Governance-Submission übermitteln',
        description: 'Erstellen Sie Grants für Kanton St. Gallen, EFD–EFV/Bundestresorerie und Thomas Kriegli. Verwenden Sie Montag bis Freitag, 07:00–19:00 Europe/Zurich, I14Y und 20 Jahre BAR-Evidenz.',
        status: 'implemented',
        checkpoint: 'Die Submission steht auf «pending_approval» und nennt Thomas als Approver.',
      },
      {
        title: 'Vier-Augen-Freigabe durchführen',
        description: 'Wechseln Sie zu Thomas, öffnen Sie die persönliche Aufgabe und prüfen Sie Empfänger, Gruppen-Snapshots, Bürozeiten, I14Y, BAR und Policy-Revision vor der Genehmigung.',
        status: 'implemented',
        actions: [{ label: 'Aufgaben als Thomas öffnen', target: 'internal', path: '/tasks', demoUserId: 'thomas.kriegli' }],
        checkpoint: 'OPA- und PostgreSQL-Deployment stehen auf «deployed»; Produkt und Publikation sind aktiv.',
      },
      {
        title: 'Durchsetzung am REST-Endpunkt prüfen',
        description: 'Ohne X-DaCa-User gilt 401. Nicht berechtigte Personen erhalten 403. Beat, Daniel und Thomas erhalten innerhalb der Bürozeiten 200. Ein nicht erreichbares OPA führt fail-closed zu 503.',
        status: 'implemented',
        actions: [{ label: 'Produktzugriff prüfen', target: 'internal', path: '/products', demoUserId: 'joel.ruod' }],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-01-daca-governance.webp`,
          alt: 'DaCa Governance-Review mit Empfängern, Bürozeiten und technischer Deployment-Bestätigung.',
          caption: 'Die Metadaten werden erst nach zweiter Freigabe und erfolgreicher technischer Projektion aktiv.',
        }],
      },
    ],
  },
  {
    id: 'consumer-access-request',
    number: '03',
    title: 'Datenprodukt finden und Zugriff beantragen',
    summary: 'Ein Data Consumer findet ein geeignetes Produkt; der Data Owner prüft und publiziert die zeitlich begrenzte Policy.',
    duration: '10–15 Minuten',
    difficulty: 'Mittel',
    systems: ['DaCa', 'OPA'],
    roles: [
      { name: 'Beat Stalder', responsibility: 'Data Consumer' },
      { name: 'Kassandra Valdata', responsibility: 'Data Owner' },
    ],
    prerequisites: ['Die Kassandra-Silver-Fixture «Mehrwertsteuer – Branchenindikatoren» ist zurückgesetzt oder kann geöffnet werden.'],
    outcome: 'Beat besitzt eine nachvollziehbare, zeitlich begrenzte Freigabe; Kassandra sieht Anfrage, Policy und aktive Konsumenten.',
    repeatability: 'Am Ende wird das Fixture-Produkt samt Anträgen und Policies über den bestätigungspflichtigen PoC-Reset entfernt.',
    steps: [
      {
        title: 'Silver-Fixture als Kassandra erzeugen',
        description: 'Öffnen Sie «Datenprodukt im DaCa eingereicht», wählen Sie die Kassandra-Silver-Fixture und lösen Sie die Metadatenpublikation aus.',
        status: 'simulation',
        actions: [{ label: 'Fixture als Kassandra vorbereiten', target: 'internal', path: '/poc-simulation/product-submitted', demoUserId: 'kassandra.valdata' }],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-02-fixture.webp`,
          alt: 'DaCa PoC-Fixture-Auswahl mit dem Silver-Datenprodukt Mehrwertsteuer Branchenindikatoren.',
          caption: 'Die Fixture nutzt denselben Metadatenendpoint wie eine externe DAAIF-Integration und bleibt vollständig rücksetzbar.',
        }],
      },
      {
        title: 'Produkt als Beat finden und verstehen',
        description: 'Wechseln Sie zu Beat, suchen Sie nach «Mehrwertsteuer» und prüfen Sie Übersicht, Metadaten, Schnittstelle und Lineage.',
        status: 'implemented',
        actions: [{ label: 'Katalogsuche als Beat öffnen', target: 'internal', path: '/search', demoUserId: 'beat.stalder' }],
        checkpoint: 'Das Produkt ist auffindbar, aber Auffindbarkeit allein gewährt noch keinen Datenzugriff.',
      },
      {
        title: 'Persönlichen REST-Zugriff beantragen',
        description: 'Erfassen Sie einen verständlichen Zweck, die behördliche Rechtsgrundlage, REST/HTTP, gewünschte Variante und einen begrenzten Zeitraum.',
        status: 'implemented',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-02-request.webp`,
          alt: 'DaCa Formular für einen persönlichen Zugriff auf ein internes Datenprodukt.',
          caption: 'Identität, Zweck, Rechtsgrundlage, Protokoll, Variante und Gültigkeit werden gemeinsam gespeichert.',
        }],
      },
      {
        title: 'Anfrage als Kassandra prüfen',
        description: 'Öffnen Sie Kassandras Aufgaben, genehmigen Sie die passende Datenvariante und prüfen Sie anschliessend den erzeugten Rego-Entwurf.',
        status: 'implemented',
        actions: [{ label: 'Aufgaben als Kassandra öffnen', target: 'internal', path: '/tasks', demoUserId: 'kassandra.valdata' }],
      },
      {
        title: 'Policy bewusst publizieren',
        description: 'Publizieren Sie den Policy-Entwurf erst nach der Kontrolle. Der Zugriff wird erst nach erfolgreicher Projektion aktiv.',
        status: 'implemented',
        checkpoint: 'Die Anfrage steht auf «Zugriff gewährt» und Beat erscheint als aktiver Konsument.',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-02-policy.webp`,
          alt: 'DaCa Aufgabenansicht mit genehmigter Zugriffsanfrage und Aktion zum Publizieren der Policy.',
          caption: 'Genehmigung und technische Policy-Publikation sind zwei sichtbare, getrennte Schritte.',
        }],
      },
      {
        title: 'Fixture zurücksetzen',
        description: 'Wechseln Sie zurück zur Fixture-Ansicht, geben Sie den angezeigten Bestätigungsnamen ein und setzen Sie nur dieses synthetische Produkt zurück.',
        status: 'simulation',
        warning: 'Audit-, Provenienz-URN und Reset-Nachweis bleiben absichtlich erhalten.',
        actions: [{ label: 'Fixture-Reset öffnen', target: 'internal', path: '/poc-simulation/product-submitted', demoUserId: 'kassandra.valdata' }],
      },
    ],
  },
  {
    id: 'metadata-quality',
    number: '04',
    title: 'Metadatenqualität von Bronze zu Platinum',
    summary: 'Eine kantonale Data Ownerin ergänzt technische, fachliche und semantische Informationen bis zur höchsten PoC-Reifestufe.',
    duration: '10–15 Minuten',
    difficulty: 'Mittel',
    systems: ['DaCa'],
    roles: [
      { name: 'Noémie Rochat', responsibility: 'Data Owner · Kanton Neuchâtel' },
      { name: 'Data Steward', responsibility: 'Optionale fachliche Unterstützung' },
    ],
    prerequisites: ['Die Noémie-Bronze-Fixture «Quellensteuer Neuchâtel» ist zurückgesetzt oder kann geöffnet werden.'],
    outcome: 'Ein verständlich beschriebenes und semantisch eingeordnetes Datenprodukt mit nachvollziehbarer Herkunft und Platinum-Bewertung.',
    repeatability: 'Das Fixture-Produkt kann nach der Qualitätsprüfung physisch und gezielt zurückgesetzt werden.',
    steps: [
      {
        title: 'Bronze-Fixture als Noémie erzeugen',
        description: 'Publizieren Sie die technische Bronze-Fixture. DaCa erzeugt ein Produkt und persönliche Aufgaben, aber noch keine Datenfreigabe.',
        status: 'simulation',
        actions: [{ label: 'Bronze-Fixture vorbereiten', target: 'internal', path: '/poc-simulation/product-submitted', demoUserId: 'noemie.rochat' }],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-03-bronze.webp`,
          alt: 'PoC-Fixture-Liste von Noémie Rochat mit einem Bronze-Datenprodukt.',
          caption: 'Bronze enthält bewusst nur technische REST-Metadaten und macht die offenen Qualitätskriterien sichtbar.',
        }],
      },
      {
        title: 'Technisches Schema und Kernfelder prüfen',
        description: 'Kontrollieren Sie Feldnamen, Datentypen und Nullbarkeit. Markieren Sie nur die fachlich identifizierenden Kernfelder.',
        status: 'implemented',
      },
      {
        title: 'Fachliche Metadaten ergänzen',
        description: 'Erfassen Sie Titel, Beschreibung, Fachgebiet, Klassifikation, Kontakt, Aktualisierung und verständliche Feldbeschreibungen.',
        status: 'implemented',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-03-quality.webp`,
          alt: 'DaCa Qualitätswizard mit technischen Feldern und fachlichen Beschreibungen.',
          caption: 'Die geführte Prüfung zeigt jederzeit, welche Kriterien für die nächste Reifestufe fehlen.',
        }],
      },
      {
        title: 'DCAT und Ontologie bestätigen',
        description: 'Prüfen Sie die vorgeschlagene Produktklasse und die Zuordnung der Kernfelder zur kanonischen Steuerontologie.',
        status: 'implemented',
      },
      {
        title: 'Kontextgraph kontrollieren',
        description: 'Bestätigen Sie die Beziehungen zwischen Quelle, Produkt, Fachgebiet, Owner und REST-Bereitstellung.',
        status: 'simulation',
        warning: 'KOBY Graphify ist in diesem PoC deterministisch simuliert und führt keinen externen AI-Aufruf aus.',
      },
      {
        title: 'Platinum und Provenienz prüfen',
        description: 'Vergleichen Sie Qualitätsmedaille, Produktmetadaten und die append-only Lineage-/Provenienzansicht.',
        status: 'implemented',
        checkpoint: 'Die Qualitätsansicht meldet 6/6 Kriterien und die Produktübersicht zeigt Platinum.',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-03-lineage.webp`,
          alt: 'DaCa Lineage-Ansicht mit Quelle, Datenprodukt, Owner, Fachkontext und REST-Bereitstellung.',
          caption: 'Lineage und Provenienz machen Herkunft und Bearbeitungsschritte des synthetischen Produkts nachvollziehbar.',
        }],
      },
      {
        title: 'Fixture physisch zurücksetzen',
        description: 'Löschen Sie über den bestätigungspflichtigen Reset Produkt, Publikation und abhängige synthetische Daten.',
        status: 'simulation',
        actions: [{ label: 'Fixture-Reset öffnen', target: 'internal', path: '/poc-simulation/product-submitted', demoUserId: 'noemie.rochat' }],
      },
    ],
  },
  {
    id: 'governance-exception',
    number: '05',
    title: 'Governance-Ausnahmefall bearbeiten',
    summary: 'Ein kontrolliertes Ereignis erzeugt einen sichtbaren Produktzustand, eine persönliche Aufgabe und eine bleibende Auditspur.',
    duration: '5–10 Minuten',
    difficulty: 'Einfach',
    systems: ['DaCa'],
    roles: [
      { name: 'Beat Stalder', responsibility: 'Data Owner' },
      { name: 'Data Steward oder ISBO', responsibility: 'Prüfende Fachrolle' },
    ],
    prerequisites: ['Eine Beat-Fixture wurde über «Datenprodukt im DaCa eingereicht» erzeugt.'],
    outcome: 'Die Testperson kann Wirkung, Aufgabe, Auditnachweis und gezielten Reset eines Governance-Ereignisses unterscheiden.',
    repeatability: 'Jedes Ereignis wird einzeln zurückgesetzt; danach kann ein anderer Ausnahmefall auf derselben Fixture ausgelöst werden.',
    steps: [
      {
        title: 'Fixture und Simulation auswählen',
        description: 'Bereiten Sie als Beat ein Fixture-Produkt vor und öffnen Sie anschliessend den Bereich «Simulationen und Grenzfälle».',
        status: 'simulation',
        actions: [
          { label: 'Beat-Fixture vorbereiten', target: 'internal', path: '/poc-simulation/product-submitted', demoUserId: 'beat.stalder' },
          { label: 'Simulationen öffnen', target: 'internal', path: '/poc-simulation', demoUserId: 'beat.stalder' },
        ],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-04-simulations.webp`,
          alt: 'DaCa Übersicht der kontrollierten Ereignisse für Qualität, Auffindbarkeit und ISBO-Einschränkung.',
          caption: 'Alle Ereignisse sind auf synthetische Fixture-Produkte begrenzt und einzeln rücksetzbar.',
        }],
      },
      {
        title: 'Einen Ausnahmefall auslösen',
        description: 'Wählen Sie «Datenqualität zu tief», «nicht auffindbar» oder «durch ISBO eingeschränkt» und bestätigen Sie das konkrete Fixture-Produkt.',
        status: 'simulation',
        checkpoint: 'Die Antwort nennt Ereignis-ID, betroffenen Produktzustand und gegebenenfalls die neue Aufgabe.',
      },
      {
        title: 'Produktwirkung untersuchen',
        description: 'Öffnen Sie das Produkt und vergleichen Sie Warnhinweis, Sichtbarkeit beziehungsweise Sicherheitseinschränkung mit dem Ausgangszustand.',
        status: 'implemented',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-04-alert.webp`,
          alt: 'DaCa Produktübersicht mit einem auffälligen Governance-Warnhinweis.',
          caption: 'Der simulierte Auslöser verändert einen klar begrenzten Zustand; bestehende Freigaben werden nicht heimlich widerrufen.',
        }],
      },
      {
        title: 'Persönliche Aufgabe prüfen',
        description: 'Öffnen Sie Beats Aufgabenliste. Kontrollieren Sie Titel, Detail, Zeitpunkt und Verknüpfung zum betroffenen Produkt.',
        status: 'implemented',
        actions: [{ label: 'Aufgaben als Beat öffnen', target: 'internal', path: '/tasks', demoUserId: 'beat.stalder' }],
      },
      {
        title: 'Ereignis gezielt zurücksetzen',
        description: 'Setzen Sie nur das aktive Ereignis zurück. Der fachliche Produktzustand wird wiederhergestellt; Audit- und Reset-Nachweis bleiben append-only erhalten.',
        status: 'simulation',
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-04-reset.webp`,
          alt: 'DaCa Simulationsansicht mit aktivem Ereignis und sichtbarer Aktion zum gezielten Zurücksetzen.',
          caption: 'Reset bedeutet Zustandswiederherstellung, nicht das Löschen der nachvollziehbaren Auditspur.',
        }],
      },
    ],
  },
  {
    id: 'change-history',
    number: '06',
    title: 'Änderungen und Freigaben nachvollziehen',
    summary: 'Owner, Approver und Data Consumer prüfen denselben echten Produktverlauf mit passend geschützter Evidenz.',
    duration: '8–12 Minuten',
    difficulty: 'Einfach',
    systems: ['DaCa'],
    roles: [
      { name: 'Joel Ruod', responsibility: 'Data Owner · freigegebene technische Evidenz' },
      { name: 'Thomas Kriegli', responsibility: 'Publication Approver · freigegebene Prüfevidenz' },
      { name: 'Beat Stalder', responsibility: 'Data Consumer · sichere fachliche Zusammenfassung' },
    ],
    prerequisites: [
      'A Data Analyst’s Journey wurde bis zur bestätigten Aktivierung abgeschlossen.',
      'Das Gewerbesteuer-Datenprodukt ist in DaCa aktiv und auffindbar.',
    ],
    outcome: 'Die Testperson kann reale Zustandsänderungen zeitlich einordnen, Rollenrechte vergleichen und Änderungsverlauf klar von Lineage unterscheiden.',
    repeatability: 'Die Journey ist vollständig read-only. Sie erzeugt und verändert keine Audit-Ereignisse und benötigt deshalb keinen Reset.',
    verification: {
      label: 'Rollenbasiert verifiziert',
      detail: 'Owner und Approver sehen freigegebene technische Evidenz; gewöhnliche Betrachter erhalten denselben fachlichen Verlauf ohne interne IDs, Kommentare oder Fehlerdetails.',
    },
    steps: [
      {
        title: 'Änderungsverlauf als Joel öffnen',
        description: 'Öffnen Sie das Journey-Datenprodukt als Joel und wählen Sie den Reiter «Änderungsverlauf». Die Ansicht liest ausschliesslich persistierte Audit-Ereignisse.',
        status: 'implemented',
        actions: [{
          label: 'Änderungsverlauf als Joel öffnen',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/history`,
          demoUserId: 'joel.ruod',
        }],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-05-history-owner.webp`,
          alt: 'DaCa Änderungsverlauf des Gewerbesteuer-Datenprodukts aus Sicht von Joel Ruod mit technischer Evidenz.',
          caption: 'Der Data Owner sieht die verständliche Aktivität und darf zusätzlich freigegebene technische Korrelations- und Deployment-Evidenz aufklappen.',
        }],
      },
      {
        title: 'Lebenszyklus vollständig lesen',
        description: 'Lesen Sie die Ereignisse von unten nach oben: Übernahme aus DAAIF, Qualitätsprüfung, Vier-Augen-Einreichung, Genehmigung und bestätigte Aktivierung.',
        status: 'implemented',
        checkpoint: 'Der Verlauf enthält mindestens fünf echte fachliche Meilensteine und ist absteigend nach Zeitpunkt sortiert.',
      },
      {
        title: 'Filter und technische Aktivierung prüfen',
        description: 'Filtern Sie nach «Metadaten & Qualität», «Zugriff & Freigabe» und «Technische Aktivierung». Öffnen Sie als Joel die technische Evidenz einer Aktivierung.',
        status: 'implemented',
        checkpoint: 'Policy-Revision und fachliche Zielsysteme bleiben sichtbar; nur interne Korrelations- und Prüfevidenz ist Owner oder Approver vorbehalten. Tokens und Zugangsdaten erscheinen nie.',
      },
      {
        title: 'Approver-Sicht mit Thomas vergleichen',
        description: 'Wechseln Sie zu Thomas. Als zugewiesener Approver kann er die für seine Vier-Augen-Entscheidung freigegebene Evidenz nachvollziehen, ohne einen neuen Entscheid auszulösen.',
        status: 'implemented',
        actions: [{
          label: 'Änderungsverlauf als Thomas öffnen',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/history`,
          demoUserId: 'thomas.kriegli',
        }],
      },
      {
        title: 'Sichere Consumer-Sicht mit Beat prüfen',
        description: 'Wechseln Sie zu Beat. Der fachliche Lebenszyklus bleibt verständlich, aber interne Korrelations-IDs, Subject-IDs, Prüfungskommentare und technische Fehlerdetails sind ausgeblendet.',
        status: 'implemented',
        warning: 'Die Timeline ist kein Rohdaten-Dump. Rollenabhängige Reduktion ist Teil des Sicherheitsmodells.',
        actions: [{
          label: 'Änderungsverlauf als Beat öffnen',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/history`,
          demoUserId: 'beat.stalder',
        }],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-05-history-viewer.webp`,
          alt: 'DaCa Änderungsverlauf aus Sicht von Beat Stalder mit fachlichen Ereignissen und ohne technische Evidenz.',
          caption: 'Ein berechtigter Data Consumer versteht den Lebenszyklus, erhält aber keine internen Identifikatoren oder vertraulichen Prüfdetails.',
        }],
      },
      {
        title: 'Letzte Änderungen im Metadata Studio prüfen',
        description: 'Öffnen Sie als Joel das Metadata Studio. Die Seitenleiste zeigt die drei neuesten echten Ereignisse statt erfundener Beispiele und führt zurück zum vollständigen Verlauf.',
        status: 'implemented',
        actions: [{
          label: 'Metadata Studio als Joel öffnen',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/metadata`,
          demoUserId: 'joel.ruod',
        }],
        screenshots: [{
          src: `${IMAGE_ROOT}/journey-05-history-metadata.webp`,
          alt: 'DaCa Metadata Studio mit den drei neuesten echten Aktivitäten und Link zum vollständigen Änderungsverlauf.',
          caption: 'Die kompakte Vorschau bleibt mit dem vollständigen Verlauf synchron und enthält keine statisch erfundenen Audit-Beispiele.',
        }],
      },
      {
        title: 'Änderungsverlauf und Lineage unterscheiden',
        description: 'Öffnen Sie abschliessend «Lineage & Provenienz». Lineage erklärt Quelle und Verarbeitung der Daten; der Änderungsverlauf dokumentiert Zustandsänderungen, Entscheidungen und technische Aktivierung.',
        status: 'implemented',
        actions: [{
          label: 'Lineage & Provenienz öffnen',
          target: 'internal',
          path: `/products/${DATA_ANALYST_JOURNEY_PRODUCT_ID}/lineage`,
          demoUserId: 'joel.ruod',
        }],
        checkpoint: 'Keine Aktion dieser Journey hat Produkt, Policy oder Auditspur verändert.',
        warning: 'Der Änderungsverlauf ist nachvollziehbare Produktevidenz, aber kein formeller Audit-Workflow mit Feststellungen und Sign-off.',
      },
    ],
  },
] as const;

export function pocJourneyById(id: string | null | undefined): PocJourney | undefined {
  return POC_JOURNEYS.find((journey) => journey.id === id);
}

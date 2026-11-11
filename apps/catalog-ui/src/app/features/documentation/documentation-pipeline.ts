export type PipelineCopy = readonly [string, string, string, string];

interface PipelineStage {
  readonly title: PipelineCopy;
  readonly caption: PipelineCopy;
  readonly summary: PipelineCopy;
  readonly detail: PipelineCopy;
  readonly tags: readonly PipelineCopy[];
}

/** Explanatory platform architecture, independent of catalog records and live traffic. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    title: ['Datenquellen', 'Sources de données', 'Fonti di dati', 'Data sources'],
    caption: ['Data Sources', 'Data Sources', 'Data Sources', 'Collect'],
    summary: ['Hier entstehen die Daten.', 'Les données naissent ici.', 'Qui nascono i dati.', 'Where data originates.'],
    detail: ['DAAIF reicht den Sourcing Task über einen geführten Data-Sourcing-Wizard ein. Der SDAL prüft die Zugriffsrichtlinie und liefert Introspektionsmetadaten. Source Connectors (SC), etwa für PG, S3, Oracle oder SAP, führen die Extraktion aus und speichern die Daten strukturiert oder unstrukturiert im Data Lake.', 'DAAIF soumet la tâche via un assistant guidé de Data Sourcing. Le SDAL vérifie la politique d’accès et fournit les métadonnées d’introspection. Les Source Connectors (SC), par exemple pour PG, S3, Oracle ou SAP, extraient les données et les stockent sous forme structurée ou non structurée dans le Data Lake.', 'DAAIF invia il Sourcing Task tramite una procedura guidata di Data Sourcing. SDAL verifica la policy di accesso e fornisce i metadati di introspezione. I Source Connectors (SC), ad esempio per PG, S3, Oracle o SAP, estraggono i dati e li archiviano in forma strutturata o non strutturata nel Data Lake.', 'DAAIF submits the Sourcing Task through a guided Data Sourcing Wizard. SDAL checks the access policy and provides introspection metadata. Source Connectors (SC), such as those for PG, S3, Oracle or SAP, perform extraction and store the data in structured or unstructured form in the Data Lake.'],
    tags: [['S3', 'S3', 'S3', 'S3'], ['Dateien', 'Fichiers', 'File', 'Files'], ['Datenbanken', 'Bases de données', 'Banche dati', 'Databases'], ['REST API', 'REST API', 'REST API', 'REST API']],
  },
  {
    title: ['Rohdaten', 'Données brutes', 'Dati grezzi', 'Raw data'],
    caption: ['Raw Data', 'Raw Data', 'Raw Data', 'Preserve'],
    summary: ['Ankommen. Herkunft bewahren.', 'Recevoir. Préserver l’origine.', 'Ricevere. Conservare l’origine.', 'Receive. Preserve the origin.'],
    detail: ['Die Daten werden zunächst in ihrer ursprünglichen Form aufgenommen. Herkunft und Eingangszeitpunkt schaffen eine nachvollziehbare Grundlage für die weitere Verarbeitung.', 'Les données sont d’abord reçues dans leur forme originale. Leur origine et leur date de réception constituent une base traçable pour le traitement.', 'I dati vengono inizialmente acquisiti nella loro forma originale. Origine e momento di ricezione creano una base tracciabile per le elaborazioni successive.', 'Data is first received in its original form. Source and arrival time provide a traceable foundation for further processing.'],
    tags: [['Originalformat', 'Format original', 'Formato originale', 'Original format'], ['Herkunft', 'Origine', 'Origine', 'Provenance']],
  },
  {
    title: ['Veredelung', 'Valorisation', 'Raffinamento', 'Refinement'],
    caption: ['Refinement', 'Refinement', 'Refinement', 'Refine'],
    summary: ['Aus Daten wird Bedeutung.', 'Les données prennent du sens.', 'I dati acquistano significato.', 'Turn data into meaning.'],
    detail: ['Die Plattform prüft die Qualität, vereinheitlicht Formate und verknüpft passende Daten. Aus einzelnen Datensätzen entsteht ein fachlich nutzbares Ergebnis; die Verarbeitungsschritte bilden die Lineage.', 'La plateforme contrôle la qualité, harmonise les formats et relie les données pertinentes. Les enregistrements deviennent un résultat exploitable ; les étapes constituent le lignage.', 'La piattaforma verifica la qualità, uniforma i formati e collega i dati pertinenti. I record diventano un risultato utilizzabile; i passaggi costituiscono la lineage.', 'The platform checks quality, harmonizes formats and combines relevant data. Individual records become a useful business result; processing steps form its lineage.'],
    tags: [['Prüfen', 'Vérifier', 'Verificare', 'Validate'], ['Harmonisieren', 'Harmoniser', 'Armonizzare', 'Harmonize'], ['Verknüpfen', 'Relier', 'Collegare', 'Combine']],
  },
  {
    title: ['Datenprodukt', 'Produit de données', 'Prodotto di dati', 'Data product'],
    caption: ['Data Product', 'Data Product', 'Data Product', 'Shape'],
    summary: ['Ein Ergebnis mit klarem Profil.', 'Un résultat bien défini.', 'Un risultato ben definito.', 'A result with a clear purpose.'],
    detail: ['Das Ergebnis erhält eine Beschreibung, ein Schema und einen verantwortlichen Data Owner. DaCa macht diese Metadaten, die Herkunft und die angebotenen Schnittstellen zentral auffindbar.', 'Le résultat reçoit une description, un schéma et un Data Owner responsable. DaCa centralise la recherche de ces métadonnées, de l’origine et des interfaces proposées.', 'Il risultato riceve una descrizione, uno schema e un Data Owner responsabile. DaCa rende reperibili centralmente questi metadati, l’origine e le interfacce offerte.', 'The result receives a description, a schema and a responsible Data Owner. DaCa makes this metadata, its provenance and its offered interfaces centrally discoverable.'],
    tags: [['Metadaten', 'Métadonnées', 'Metadati', 'Metadata'], ['Schema', 'Schéma', 'Schema', 'Schema'], ['Data Owner', 'Data Owner', 'Data Owner', 'Data Owner']],
  },
  {
    title: ['Datenschutz', 'Protection des données', 'Protezione dei dati', 'Data protection'],
    caption: ['Data Protection', 'Data Protection', 'Data Protection', 'Protect'],
    summary: ['Klare Regeln. Geprüfte Freigabe.', 'Des règles claires. Un accès vérifié.', 'Regole chiare. Accesso verificato.', 'Clear rules. Verified access.'],
    detail: ['Die veröffentlichte Zugriffsrichtlinie regelt, wer welche Daten lesen darf. HTTP/REST wird am Zugriffspunkt geprüft; PostgreSQL schützt mit Rechten und Zeilenregeln. Eine Freigabe ist erst aktiv, wenn OPA und PostgreSQL dieselbe Revision bestätigen. Ohne gültige Entscheidung bleibt der Zugriff gesperrt.', 'La politique publiée détermine qui peut lire quelles données. HTTP/REST est contrôlé au point d’accès ; PostgreSQL applique les droits et règles de lignes. L’accès n’est actif qu’après confirmation de la même révision par OPA et PostgreSQL. Sans décision valide, l’accès reste bloqué.', 'La policy pubblicata stabilisce chi può leggere quali dati. HTTP/REST viene verificato al punto di accesso; PostgreSQL applica permessi e regole di riga. L’accesso è attivo solo dopo la conferma della stessa revisione da OPA e PostgreSQL. Senza decisione valida, l’accesso resta bloccato.', 'The published policy defines who may read which data. HTTP/REST is checked at the access point; PostgreSQL enforces privileges and row rules. Access becomes active only when OPA and PostgreSQL confirm the same revision. Without a valid decision, access stays blocked.'],
    tags: [['Zugriffsrichtlinie', 'Politique', 'Policy', 'Policy'], ['HTTP/REST', 'HTTP/REST', 'HTTP/REST', 'HTTP/REST'], ['PostgreSQL', 'PostgreSQL', 'PostgreSQL', 'PostgreSQL']],
  },
  {
    title: ['Datenkonsumenten', 'Consommateurs', 'Consumatori di dati', 'Data consumers'],
    caption: ['Data Consumers', 'Data Consumers', 'Data Consumers', 'Use'],
    summary: ['Ein Produkt. Mehrere Konsumenten.', 'Un produit. Plusieurs consommateurs.', 'Un prodotto. Più consumatori.', 'One product. Multiple consumers.'],
    detail: ['Mehrere berechtigte Personen und Anwendungen können dasselbe Datenprodukt gleichzeitig über die freigegebene Schnittstelle nutzen, etwa für Analysen oder Fachprozesse. DaCa dokumentiert Beziehungen und Provenienz; Daten werden über die geschützten Produktendpunkte geliefert.', 'Plusieurs personnes et applications autorisées peuvent consommer simultanément le même produit via l’interface approuvée, pour des analyses ou processus métier. DaCa documente les relations et la provenance ; les données sont livrées par les points d’accès protégés du produit.', 'Più persone e applicazioni autorizzate possono consumare contemporaneamente lo stesso prodotto tramite l’interfaccia approvata, per analisi o processi specialistici. DaCa documenta relazioni e provenienza; i dati vengono forniti dagli endpoint protetti del prodotto.', 'Multiple authorized people and applications can consume the same product simultaneously through its approved interface, for analytics or business processes. DaCa documents relationships and provenance; data is delivered through protected product endpoints.'],
    tags: [['Analysen', 'Analyses', 'Analisi', 'Analytics'], ['Anwendungen', 'Applications', 'Applicazioni', 'Applications']],
  },
];

"""Small, idempotent glossary vocabulary used by the DaCa interface."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from .models import SiteGlossaryLocalization, SiteGlossaryTerm, utc_now

_TERMS = (
    (
        "data-owner", None,
        {
            "de": ("Data Owner", "Fachlich verantwortliche Person für eine zugewiesene Domäne, ein Modell oder Datenprodukt.", "Aufgaben: Der Data Owner bestimmt fachliche Bedeutung, Qualität und Nutzung der ihm zugewiesenen Datenobjekte und prüft eingereichte logische Modelle. Kompetenzen: Er kann Objekte in seinem Geltungsbereich bearbeiten; der primäre Domain Owner entscheidet über die Freigabe eines logischen Modells. Bei Datenprodukten gelten die gesonderten Eigentümer- und Vier-Augen-Prozesse. Verantwortung: Er trägt die fachliche Rechenschaft für seinen zugewiesenen Bereich, die Nachvollziehbarkeit der Entscheidungen und angemessene Zugriffsvorgaben. Die Rolle verleiht keinen pauschalen Zugriff auf Datenzeilen."),
            "fr": ("Data Owner", "Personne responsable du contenu d'un domaine, modèle ou produit de données attribué.", "Tâches : définir le sens métier, la qualité et l'usage des objets attribués et examiner les modèles logiques soumis. Compétences : modifier les objets dans son périmètre ; seul le responsable principal du domaine décide de l'approbation d'un modèle logique. Les produits de données suivent leurs propres processus de validation à quatre yeux. Responsabilité : répondre du domaine attribué, de la traçabilité des décisions et des règles d'accès appropriées. Le rôle ne donne pas un accès général aux lignes de données."),
            "it": ("Data Owner", "Persona responsabile degli aspetti funzionali di un dominio, modello o prodotto dati assegnato.", "Compiti: definire significato, qualità e utilizzo degli oggetti assegnati ed esaminare i modelli logici presentati. Competenze: modificare gli oggetti nel proprio ambito; solo il responsabile principale del dominio decide l'approvazione di un modello logico. Per i prodotti dati valgono procedure separate a quattro occhi. Responsabilità: rispondere dell'ambito assegnato, della tracciabilità delle decisioni e delle regole di accesso appropriate. Il ruolo non concede accesso generale alle righe di dati."),
            "en": ("Data Owner", "Business owner of an assigned domain, model or data product.", "Tasks: define the business meaning, quality and use of assigned data objects and review submitted logical models. Authority: edit objects within the assigned scope; only the primary Domain Owner decides a logical-model review. Separate owner and four-eyes workflows govern data products. Accountability: answer for the assigned scope, traceable decisions and appropriate access rules. The role grants no blanket access to data rows."),
        },
    ),
    (
        "data-steward", None,
        {
            "de": ("Data Steward", "Pflegt Datenmodelle und Metadaten im ausdrücklich zugewiesenen Bereich.", "Aufgaben: Der Data Steward erfasst und pflegt fachliche Beschreibungen, logische Modelle, Felder, technische Strukturmetadaten und Zuordnungen; er prüft die Qualität und reicht Modellversionen zur Freigabe ein. Kompetenzen: Er darf diese Inhalte nur innerhalb seiner aktiven Organisations- oder Objektzuweisung bearbeiten, technische Metadaten importieren und Mappings validieren. Verantwortung: Er hält Beschreibungen und Zuordnungen korrekt und nachvollziehbar und legt Änderungen dem zuständigen Data Owner vor. Er entscheidet keine eigene Modellfreigabe und erhält durch die Rolle keinen pauschalen Zugriff auf Datenzeilen."),
            "fr": ("Data Steward", "Gère les modèles et les métadonnées dans le périmètre attribué.", "Tâches : créer et maintenir les descriptions, modèles logiques, champs, métadonnées structurelles et correspondances, contrôler leur qualité et soumettre les versions à validation. Compétences : modifier ces contenus dans son périmètre organisationnel ou objet actif, importer des métadonnées techniques et valider les correspondances. Responsabilité : assurer l'exactitude et la traçabilité et présenter les modifications au Data Owner compétent. Il ne valide pas son propre modèle et n'obtient pas d'accès général aux lignes de données."),
            "it": ("Data Steward", "Cura modelli e metadati nell'ambito assegnato.", "Compiti: creare e mantenere descrizioni, modelli logici, campi, metadati strutturali e mappature, verificarne la qualità e presentare le versioni per l'approvazione. Competenze: modificare questi contenuti solo nell'ambito organizzativo o dell'oggetto assegnato, importare metadati tecnici e validare mappature. Responsabilità: garantire correttezza e tracciabilità e sottoporre le modifiche al Data Owner competente. Non approva il proprio modello e non ottiene accesso generale alle righe di dati."),
            "en": ("Data Steward", "Maintains models and metadata within an assigned scope.", "Tasks: create and maintain descriptions, logical models, fields, technical structure metadata and mappings, check quality and submit model versions for review. Authority: edit only within an active organizational or object assignment, import technical metadata and validate mappings. Accountability: keep descriptions and mappings accurate and traceable and submit changes to the responsible Data Owner. A steward cannot approve their own model and has no blanket access to data rows."),
        },
    ),
    (
        "deputy-data-owner", "Stv.",
        {
            "de": ("Stv. Data Owner", "Ausdrücklich zugewiesene Stellvertretung eines Data Owners.", "Eine Stellvertretung ist einer bestimmten verantwortlichen Person oder einem bestimmten Datenobjekt zugeordnet. Sie übernimmt nur die im jeweiligen Prozess ausdrücklich erlaubten Handlungen."),
            "fr": ("Data Owner suppléant", "Suppléance explicitement attribuée à un Data Owner.", "La suppléance est liée à une personne ou à un objet précis et n'autorise que les actions prévues par le processus."),
            "it": ("Sostituto Data Owner", "Sostituzione assegnata esplicitamente a un Data Owner.", "La sostituzione riguarda una persona o un oggetto specifico e consente solo le azioni previste dal processo."),
            "en": ("Deputy Data Owner", "Explicitly assigned deputy for a Data Owner.", "A deputy is linked to a specific owner or object and may perform only actions allowed by that workflow."),
        },
    ),
    (
        "domain", None,
        {"de": ("Domäne", "Fachlicher Bereich, der Datenobjekte und Verantwortung bündelt.", "Eine Domäne ordnet fachliche Begriffe, Datenmodelle und Datenprodukte einem Verantwortungsbereich mit Data Owner und Stellvertretung zu."),
         "fr": ("Domaine", "Périmètre métier regroupant des objets de données et leurs responsabilités.", "Un domaine rattache les termes métier, les modèles et les produits de données à un périmètre de responsabilité avec un Data Owner et sa suppléance."),
         "it": ("Dominio", "Ambito funzionale che raggruppa oggetti dati e responsabilità.", "Un dominio collega termini di dominio, modelli e prodotti dati a un ambito di responsabilità con un Data Owner e un sostituto."),
         "en": ("Domain", "Business area grouping data objects and responsibilities.", "A domain groups business terms, data models and data products within a responsibility area with a Data Owner and deputy.")},
    ),
    (
        "logical-model", None,
        {"de": ("Logisches Modell", "Fachliche Beschreibung von Datenstrukturen unabhängig von einer technischen Speicherung.", "Ein logisches Datenmodell beschreibt Entitäten, Felder und Beziehungen. Es kann mit einer oder mehreren physischen Repräsentationen verknüpft werden."),
         "fr": ("Modèle logique", "Description métier des structures de données indépendante du stockage.", "Un modèle logique décrit les entités, les champs et leurs relations. Il peut être relié à une ou plusieurs représentations physiques."),
         "it": ("Modello logico", "Descrizione funzionale delle strutture dati indipendente dall'archiviazione.", "Un modello logico descrive entità, campi e relazioni e può essere collegato a una o più rappresentazioni fisiche."),
         "en": ("Logical model", "Business description of data structures independent of storage.", "A logical data model describes entities, fields and relationships and can be mapped to physical representations.")},
    ),
    (
        "physical-representation", None,
        {"de": ("Physische Repräsentation", "Technische Struktur, etwa eine Tabelle oder Parquet-Datei, die ein Modell repräsentiert.", "Eine physische Repräsentation bezeichnet die technische Struktur einer Datenquelle. DaCa zeigt dazu Strukturmetadaten; Datenzeilen werden in dieser Ansicht nicht geladen."),
         "fr": ("Représentation physique", "Structure technique, telle qu'une table ou un fichier Parquet, représentant un modèle.", "Une représentation physique désigne la structure technique d'une source. DaCa affiche ses métadonnées structurelles sans charger les lignes de données dans cette vue."),
         "it": ("Rappresentazione fisica", "Struttura tecnica, per esempio una tabella o un file Parquet, che rappresenta un modello.", "Una rappresentazione fisica è la struttura tecnica di una fonte. DaCa ne mostra i metadati strutturali senza caricare le righe dei dati in questa vista."),
         "en": ("Physical representation", "Technical structure, such as a table or Parquet file, representing a model.", "A physical representation is the technical structure of a source. DaCa displays structural metadata without loading data rows in this view.")},
    ),
    (
        "data-product", None,
        {"de": ("Datenprodukt", "Beschriebenes und geregeltes Angebot zur Nutzung von Daten.", "Ein Datenprodukt verbindet Metadaten, Verantwortlichkeit, Qualitätsinformationen und freigegebene Endpunkte. Seine Daten bleiben durch die publizierte Zugriffspolitik geschützt."),
         "fr": ("Produit de données", "Offre documentée et régie pour l'utilisation des données.", "Un produit de données associe métadonnées, responsabilités, informations de qualité et points d'accès approuvés. L'accès reste soumis à la politique publiée."),
         "it": ("Prodotto dati", "Offerta documentata e regolata per l'utilizzo dei dati.", "Un prodotto dati unisce metadati, responsabilità, informazioni sulla qualità ed endpoint approvati. L'accesso resta soggetto alla politica pubblicata."),
         "en": ("Data product", "Documented, governed offering for data use.", "A data product combines metadata, ownership, quality information and approved endpoints; access remains governed by published policy.")},
    ),
    (
        "daca", "DaCa",
        {"de": ("DaCa", "Der zentrale Datenkatalog der Data Platform BIT.", "DaCa verwaltet Metadaten zu Datenobjekten, Verantwortlichkeiten, technischen Repräsentationen und geregelten Zugängen an einem zentralen Ort. Datenzeilen bleiben durch die jeweiligen Zugriffsvorgaben geschützt."),
         "fr": ("DaCa", "Le catalogue de données central de la plateforme de données de l’OFIT.", "DaCa gère au même endroit les métadonnées des objets de données, les responsabilités, les représentations techniques et les accès régis. Les lignes de données restent protégées par leurs règles d’accès."),
         "it": ("DaCa", "Il catalogo dati centrale della piattaforma dati dell’UFIT.", "DaCa gestisce in un unico luogo i metadati degli oggetti dati, le responsabilità, le rappresentazioni tecniche e gli accessi regolati. Le righe dei dati restano protette dalle rispettive regole di accesso."),
         "en": ("DaCa", "The central data catalog of the BIT data platform.", "DaCa manages metadata about data objects, responsibilities, technical representations and governed access in one central place. Data rows remain protected by their respective access rules.")},
    ),
    (
        "visible-source", None,
        {"de": ("Sichtbare Datenquelle", "Eine für die angemeldete Person sichtbare, technisch verbundene Quelle.", "Die Ansicht zeigt Strukturmetadaten und den Verbindungsstatus. Sichtbarkeit bedeutet weder Zugriff auf Datenzeilen noch, dass Daten in DaCa aufgenommen oder publiziert wurden."),
         "fr": ("Source de données visible", "Source connectée visible pour la personne connectée.", "La vue présente les métadonnées structurelles et l'état de connexion. La visibilité ne donne pas accès aux lignes de données et ne signifie pas que les données ont été ingérées ou publiées."),
         "it": ("Fonte dati visibile", "Fonte connessa visibile alla persona autenticata.", "La vista mostra metadati strutturali e stato della connessione. La visibilità non dà accesso alle righe dei dati e non significa che i dati siano stati acquisiti o pubblicati."),
         "en": ("Visible data source", "A connected source visible to the signed-in person.", "The view shows structural metadata and connection status. Visibility does not grant row access or mean the data has been ingested or published.")},
    ),
    (
        "role-change-protocol", None,
        {"de": ("Rollenprotokoll", "Chronologische Aufzeichnung von Rollen- und Zuständigkeitsänderungen.", "Das Rollenprotokoll hält Zuweisungen, Änderungen und Entzüge mit Zeitpunkt, handelnder Person und Geltungsbereich dauerhaft fest. Die Einträge dienen der Nachvollziehbarkeit; aktuelle Berechtigungen werden aus den geltenden Zuweisungen bestimmt."),
         "fr": ("Historique des rôles", "Journal chronologique des changements de rôles et de responsabilités.", "L'historique enregistre les attributions, modifications et retraits avec leur date, auteur et périmètre. Il sert à la traçabilité ; les droits actuels proviennent des attributions en vigueur."),
         "it": ("Registro dei ruoli", "Registrazione cronologica delle modifiche a ruoli e responsabilità.", "Il registro conserva assegnazioni, modifiche e revoche con data, autore e ambito. Le voci garantiscono la tracciabilità; i permessi correnti derivano dalle assegnazioni attive."),
         "en": ("Role change protocol", "Chronological record of role and responsibility changes.", "The protocol records grants, changes and revocations with time, actor and scope. Entries provide traceability; current permissions come from active assignments.")},
    ),
)


def seed_site_glossary_terms(session: Session) -> None:
    for key, abbreviation, translations in _TERMS:
        term_id = uuid.uuid5(uuid.NAMESPACE_URL, f"urn:daca:site-glossary:{key}")
        term = session.get(SiteGlossaryTerm, term_id)
        if term is not None and term.revision > 1:
            # Preserve future Control Plane revisions when a catalog restarts.
            continue
        if term is None:
            now = utc_now()
            term = SiteGlossaryTerm(
                id=term_id, key=key, abbreviation=abbreviation, is_termdat=False,
                lifecycle="active", revision=1, created_at=now, updated_at=now,
            )
            session.add(term)
        session.flush()
        for language, (label, short, detailed) in translations.items():
            entry = session.get(SiteGlossaryLocalization, (term_id, language))
            if entry is None:
                entry = SiteGlossaryLocalization(term_id=term_id, language=language)
                session.add(entry)
            # The current vocabulary is system-owned seed content. Future edits
            # will be made through the Control Plane, never by catalog users.
            entry.preferred_label = label
            entry.short_description = short
            entry.detailed_description = detailed
            entry.normalized_label = label.casefold()
    session.flush()

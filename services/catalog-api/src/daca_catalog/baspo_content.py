"""Reviewed BASPO starter vocabulary and logical design proposals (no record payloads)."""

# Labels are checked against fixtures/baspo_termdat.json. Definitions below are
# local editorial summaries, not TERMDAT quotations or official BASPO schemas.
DOMAINS = (
    ("sportpolitik", "Sportpolitik und Sportförderung", "Sportpolitische Rahmenbedingungen, Zusammenarbeit mit Sportverbänden und finanzielle Förderung von Sportvorhaben."),
    ("jugend-sport", "Jugend+Sport", "Planung, Durchführung und Abrechnung von J+S-Kursen und -Lagern sowie die beteiligten Organisationen und Kaderpersonen."),
    ("breitensport", "Breiten- und Erwachsenensport", "Sport und Bewegung für die breite Bevölkerung, Angebote von Vereinen und das Programm Erwachsenensport Schweiz esa."),
    ("sportbildung", "Sportbildung und Qualifikationen", "Aus- und Weiterbildung, Trainerbildung sowie sportbezogene Qualifikationen und Anerkennungen."),
    ("leistungssport", "Nachwuchs- und Leistungssport", "Sportliche Entwicklung, Trainingsplanung und Unterstützung von Nachwuchs- und Spitzensport."),
    ("sportanlagen", "Sportanlagen und Sportzentren", "Sportinfrastruktur, Trainings- und Ausbildungsstandorte, Kapazitäten, Belegungen und Anlagen von nationaler Bedeutung."),
    ("sportwissenschaft", "Sportwissenschaft und Leistungsdiagnostik", "Forschung über Sport und Bewegung sowie sportmedizinische und leistungsdiagnostische Dienstleistungen."),
    ("fairer-sport", "Fairer und sicherer Sport", "Ethische Grundsätze, Prävention von Doping und Unfällen sowie sichere Bedingungen im Sport."),
)

# key, source entry, definition, domain keys, business object usable by models
TERMS = (
    ("sportfoerderung", 153663, "Massnahmen, die sportliche Aktivitäten und geeignete Rahmenbedingungen für Sport auf unterschiedlichen Alters- und Leistungsstufen unterstützen.", ("sportpolitik", "breitensport"), False),
    ("sportverband", 153599, "Organisation, die Sportvereine oder andere Sportorganisationen einer Sportart oder eines Sportbereichs zusammenführt und gemeinsame Aufgaben wahrnimmt.", ("sportpolitik", "leistungssport"), True),
    ("finanzhilfe", 92589, "Geldwerter Beitrag zur Unterstützung einer selbst gewählten Aufgabe ausserhalb der Bundesverwaltung; hier im Zusammenhang mit Sportfördervorhaben.", ("sportpolitik", "sportanlagen"), True),
    ("jugend-sport", 2884, "Sportförderprogramm des Bundes für Kinder und Jugendliche. Im aktuellen J+S-Angebot werden Kurse und Lager für die Altersgruppe von 5 bis 20 Jahren unterstützt.", ("jugend-sport",), False),
    ("js-kurs", 144557, "Organisiertes, über einen Zeitraum verteiltes Sportangebot im Programm Jugend+Sport mit angeleiteten Aktivitäten und dokumentierten Teilnahmen.", ("jugend-sport",), True),
    ("js-lager", 130499, "Mehrtägiges gemeinschaftliches Sportangebot im Programm Jugend+Sport mit geplanter Tagesstruktur und qualifizierter Leitung.", ("jugend-sport", "sportanlagen"), True),
    ("js-coach", 380981, "Anerkannte Person, die J+S-Angebote ihrer Organisation administrativ koordiniert und die Verbindung zu Sportfachstellen und BASPO wahrnimmt.", ("jugend-sport",), True),
    ("js-leiter", 93981, "Person mit einer passenden J+S-Anerkennung, die Sportaktivitäten für Kinder oder Jugendliche fachlich anleitet.", ("jugend-sport", "sportbildung"), True),
    ("sportart", 155912, "Abgegrenzte Form sportlicher Betätigung mit charakteristischen Bewegungen, Regeln und gegebenenfalls spezifischen Geräten oder Umgebungen.", ("jugend-sport", "leistungssport", "breitensport"), True),
    ("bewegungsfoerderung", 153665, "Massnahmen zur Unterstützung regelmässiger körperlicher Aktivität im Alltag und in organisierten Angeboten.", ("breitensport",), False),
    ("breitensport", 155820, "Sportliche Betätigung für breite Bevölkerungsgruppen, bei der Freizeit, Gesundheit, Begegnung und Freude an Bewegung im Vordergrund stehen.", ("breitensport",), False),
    ("erwachsenensport", 384003, "Sportliche Angebote und Aktivitäten für Erwachsene; der BASPO-Kontext umfasst insbesondere das Sportförderprogramm Erwachsenensport Schweiz esa.", ("breitensport",), False),
    ("sportverein", 155940, "Vereinsmässig organisierter Zusammenschluss zur gemeinsamen sportlichen Betätigung und zur Durchführung von Sportangeboten.", ("breitensport", "jugend-sport"), True),
    ("ehsm", 3117, "Hochschule des BASPO in Magglingen mit Aufgaben in sportbezogener Lehre, Forschung und Dienstleistungen.", ("sportbildung", "sportwissenschaft"), False),
    ("trainerbildung", 135157, "Aus- und Weiterbildung von Trainerinnen und Trainern für die fachliche Begleitung und Entwicklung von Sportlerinnen und Sportlern.", ("sportbildung", "leistungssport"), False),
    ("weiterbildung", 153874, "Vertiefung und Aktualisierung sportbezogener Kompetenzen nach einer Grundausbildung; im referenzierten TERMDAT-Eintrag im Kontext Erwachsenensport.", ("sportbildung", "breitensport"), True),
    ("anerkennung", 144071, "Dokumentierte Berechtigung für eine J+S-Kaderfunktion mit bestimmtem Geltungsbereich und zeitlichem Status.", ("sportbildung", "jugend-sport"), True),
    ("leistungssport", 384004, "Sport mit systematischem Training und leistungsbezogenen Entwicklungs- oder Wettkampfzielen.", ("leistungssport",), False),
    ("nachwuchssport", 88529, "Aufbau und Entwicklung junger Sporttalente im Hinblick auf eine weiterführende Laufbahn im Leistungssport.", ("leistungssport",), False),
    ("spitzensport", 155909, "Wettkampforientierter Sport, der auf Höchstleistungen auf nationalem oder internationalem Niveau ausgerichtet ist.", ("leistungssport",), False),
    ("training", 154085, "Geplanter Übungs- und Belastungsprozess zur Entwicklung oder Erhaltung sportlicher Fähigkeiten und Leistungsfähigkeit.", ("leistungssport", "breitensport"), True),
    ("sportanlage", 127708, "Räumlich und funktional für die Ausübung von Sport eingerichtete Infrastruktur mit bestimmbaren Nutzungs- und Kapazitätseigenschaften.", ("sportanlagen",), True),
    ("nasak", 134746, "Nationales Konzept zur Planung und Unterstützung von Sportanlagen mit Bedeutung für den Schweizer Sport.", ("sportanlagen", "sportpolitik"), False),
    ("tenero", 3118, "Sportzentrum des BASPO in Tenero mit Infrastruktur und Dienstleistungen für Jugend-, Ausbildungs- und Trainingsangebote.", ("sportanlagen", "jugend-sport"), False),
    ("sportwissenschaft", 155941, "Wissenschaftliche Untersuchung von Sport, Bewegung und ihren körperlichen, gesellschaftlichen und pädagogischen Zusammenhängen.", ("sportwissenschaft",), False),
    ("leistungsdiagnostik", 486184, "Systematische Erhebung und Beurteilung sportlicher Leistungsmerkmale als Grundlage für Training und Entwicklung.", ("sportwissenschaft", "leistungssport"), True),
    ("sportmedizin", 154482, "Medizinisches Fachgebiet zu den Wirkungen von Bewegung und Sport sowie zur Prävention, Behandlung und Rehabilitation im Sport.", ("sportwissenschaft",), False),
    ("ethik-charta", 151557, "Gemeinsame ethische Orientierung für respektvolles, verantwortungsbewusstes und faires Handeln im Schweizer Sport.", ("fairer-sport", "sportpolitik"), False),
    ("doping", 5965, "Anwendung verbotener Substanzen oder Methoden im Sport zur unerlaubten Beeinflussung sportlicher Leistung.", ("fairer-sport",), False),
    ("unfallverhuetung", 402031, "Vorausschauende Massnahmen, die Unfallrisiken bei Sport und Bewegung erkennen und vermindern.", ("fairer-sport", "sportbildung"), False),
)

# Hierarchy is used only for genuine general/specific concepts; all operational
# connections use related. These are DaCa editorial relationships, not TERMDAT links.
RELATIONS = (
    ("js-kurs", "related", "jugend-sport"), ("js-lager", "related", "jugend-sport"),
    ("js-coach", "related", "js-kurs"), ("js-coach", "related", "js-lager"),
    ("js-leiter", "related", "js-kurs"), ("js-leiter", "related", "js-lager"),
    ("js-leiter", "related", "anerkennung"), ("js-coach", "related", "anerkennung"),
    ("sportart", "related", "js-kurs"), ("sportart", "related", "training"),
    ("sportverein", "related", "sportverband"), ("sportverein", "related", "js-coach"),
    ("sportverein", "related", "breitensport"), ("sportverband", "related", "sportfoerderung"),
    ("finanzhilfe", "related", "sportfoerderung"), ("finanzhilfe", "related", "nasak"),
    ("bewegungsfoerderung", "related", "sportfoerderung"),
    ("breitensport", "related", "sportfoerderung"), ("erwachsenensport", "broader", "breitensport"),
    ("erwachsenensport", "related", "bewegungsfoerderung"),
    ("trainerbildung", "related", "ehsm"), ("trainerbildung", "related", "leistungssport"),
    ("weiterbildung", "related", "anerkennung"), ("weiterbildung", "related", "erwachsenensport"),
    ("nachwuchssport", "related", "leistungssport"), ("spitzensport", "broader", "leistungssport"),
    ("training", "related", "leistungssport"), ("training", "related", "leistungsdiagnostik"),
    ("sportanlage", "related", "training"), ("nasak", "related", "sportanlage"),
    ("tenero", "related", "sportanlage"), ("tenero", "related", "js-lager"),
    ("sportwissenschaft", "related", "ehsm"), ("leistungsdiagnostik", "related", "sportwissenschaft"),
    ("sportmedizin", "related", "leistungsdiagnostik"), ("sportmedizin", "related", "sportwissenschaft"),
    ("ethik-charta", "related", "sportfoerderung"), ("doping", "related", "ethik-charta"),
    ("unfallverhuetung", "related", "js-leiter"), ("unfallverhuetung", "related", "sportanlage"),
)


# Fields: name, datatype, explanation, optional published business-object key.
# Every entity comment documents identifiers, references and business cardinality.
MODELS = (
    ("js-angebote", "Jugend+Sport – Angebote und Teilnahme", "jugend-sport", "Kurse und Lager mit Organisatoren und pseudonymisierten Teilnahmen. Ein Organisator hat 0..n Angebote; ein Angebot hat 0..n Teilnahmen.", (
        ("Organisator", "sportverein", "organisator_id identifiziert den Organisator; 1:n zu Angebot.", (
            ("organisator_id", "string", "Eindeutige fachliche Kennung des Organisators.", None),
            ("name", "string", "Bezeichnung des Organisators.", "sportverein"),
            ("kanton_code", "string", "Zuständiger Kanton; Codes fachlich bestätigen.", None),
            ("coach_referenz", "string", "Referenz auf die zuständige J+S-Coach-Person; kein Personenname.", "js-coach"))),
        ("Angebot", None, "angebot_id ist eindeutig. organisator_id verweist auf genau einen Organisator. angebot_typ unterscheidet Kurs und Lager.", (
            ("angebot_id", "string", "Eindeutige Kennung des Angebots.", None),
            ("organisator_id", "string", "n:1-Referenz auf Organisator.organisator_id.", "sportverein"),
            ("angebot_typ", "string", "Fachliche Ausprägung Kurs oder Lager; keine technische Tabelle vorgegeben.", None),
            ("sportart", "string", "Sportart des Angebots; Mehrsportartenangebote später fachlich erweitern.", "sportart"),
            ("beginn", "date", "Erster Tag des Angebots.", None),
            ("ende", "date", "Letzter Tag, nicht vor beginn.", None))),
        ("Teilnahme", None, "teilnahme_id identifiziert eine Teilnahme; n:1 zu Angebot. Keine Namen, Geburtsdaten oder Leistungsdaten von Kindern vorgesehen.", (
            ("teilnahme_id", "string", "Eindeutige Kennung der Teilnahme.", None),
            ("angebot_id", "string", "n:1-Referenz auf Angebot.angebot_id.", None),
            ("teilnehmenden_referenz", "string", "Pseudonyme fachliche Personenreferenz; bleibt schutzbedürftig.", None),
            ("anwesenheitstage", "integer", "Nicht negative Anzahl dokumentierter Teilnahmetage.", None),
            ("status", "string", "Teilnahmestatus, z. B. angemeldet oder abgeschlossen.", None))),
    )),
    ("qualifikationen", "J+S – Ausbildung und Anerkennungen", "sportbildung", "Ausbildungsangebote und sportartspezifische Anerkennungen von Kaderpersonen. Eine Kaderperson besitzt 0..n Anerkennungen; eine Ausbildung kann 0..n Anerkennungen begründen.", (
        ("Kaderperson", None, "kaderperson_id ist eine pseudonyme Kennung; 1:n zu Anerkennung.", (
            ("kaderperson_id", "string", "Pseudonyme Kennung der Kaderperson.", None),
            ("organisations_referenz", "string", "Fachliche Referenz auf den Sportorganisator.", "sportverein"),
            ("funktion", "string", "Kaderfunktion, z. B. Leiter oder Coach.", None),
            ("aktiv_seit", "date", "Beginn der dokumentierten Kadertätigkeit.", None))),
        ("Ausbildungsangebot", None, "ausbildung_id ist eindeutig; 1:n zu Anerkennung. Grundausbildung und Weiterbildung werden über ausbildung_typ unterschieden.", (
            ("ausbildung_id", "string", "Eindeutige Kennung der Ausbildung oder des Moduls.", None),
            ("titel", "string", "Fachlicher Titel des Angebots.", None),
            ("ausbildung_typ", "string", "Grundausbildung oder Weiterbildung.", None),
            ("sportart", "string", "Sportart oder interdisziplinärer Geltungsbereich.", "sportart"),
            ("abschlussdatum", "date", "Datum des Ausbildungsabschlusses.", None))),
        ("Anerkennung", "anerkennung", "anerkennung_id ist eindeutig; n:1 zu Kaderperson und 0..1 zu Ausbildungsangebot. Gültigkeit und Status werden getrennt dokumentiert.", (
            ("anerkennung_id", "string", "Eindeutige Kennung der Anerkennung.", None),
            ("kaderperson_id", "string", "n:1-Referenz auf Kaderperson.kaderperson_id.", None),
            ("ausbildung_id", "string", "Optionale n:1-Referenz auf Ausbildungsangebot.ausbildung_id.", None),
            ("sportart", "string", "Sportart der Anerkennung.", "sportart"),
            ("gueltig_bis", "date", "Fachlich festgelegtes Gültigkeitsende; keine automatische Rechtsregel.", None),
            ("status", "string", "Fachlicher Anerkennungsstatus.", "anerkennung"))),
    )),
    ("anlagenbelegung", "Sportanlagen – Inventar und Belegungen", "sportanlagen", "Infrastruktur und reservierte Nutzungszeiten für Sportzentren wie Magglingen und Tenero. Ein Standort hat 0..n Anlagen; eine Anlage hat 0..n Belegungen.", (
        ("Standort", None, "standort_id ist eindeutig; 1:n zu Sportanlage.", (
            ("standort_id", "string", "Fachliche Standortkennung.", None),
            ("name", "string", "Standortbezeichnung, z. B. Magglingen oder Tenero.", None),
            ("gemeinde_bfs_nummer", "string", "Gemeindekennung, keine Koordinaten oder Adressdaten vorgegeben.", None),
            ("standort_typ", "string", "Z. B. Ausbildungs- oder Trainingszentrum.", None))),
        ("Sportanlage", "sportanlage", "anlage_id ist eindeutig; n:1 zu Standort und 1:n zu Belegung.", (
            ("anlage_id", "string", "Eindeutige Anlagenkennung.", None),
            ("standort_id", "string", "n:1-Referenz auf Standort.standort_id.", None),
            ("bezeichnung", "string", "Fachliche Bezeichnung der Sportanlage.", "sportanlage"),
            ("anlagen_typ", "string", "Z. B. Halle, Aussenfeld oder Wasserfläche.", None),
            ("kapazitaet_personen", "integer", "Planungskapazität; nicht negative Anzahl Personen.", None))),
        ("Belegung", None, "belegung_id ist eindeutig; n:1 zu Sportanlage. Gleichzeitig reservierte Zeiten sind fachlich auf Konflikte zu prüfen.", (
            ("belegung_id", "string", "Eindeutige Kennung der Reservation.", None),
            ("anlage_id", "string", "n:1-Referenz auf Sportanlage.anlage_id.", "sportanlage"),
            ("nutzerorganisation_referenz", "string", "Referenz auf die reservierende Organisation.", "sportverein"),
            ("beginn", "dateTime", "Beginn mit Zeitzone; lokale Anzeige Europe/Zurich.", None),
            ("ende", "dateTime", "Ende mit Zeitzone, strikt nach beginn.", None),
            ("status", "string", "Z. B. angefragt, bestätigt oder storniert.", None))),
    )),
    ("leistungsfoerderung", "Nachwuchs- und Leistungssport – Förderverlauf", "leistungssport", "Sportliche Entwicklung und Fördermassnahmen mit aggregierbaren Leistungserhebungen. Ein Athletprofil hat 0..n Fördermassnahmen und 0..n Erhebungen. Keine Diagnosen oder echten Athletendaten.", (
        ("Athletprofil", None, "athlet_referenz ist pseudonym; 1:n zu Fördermassnahme und Leistungserhebung.", (
            ("athlet_referenz", "string", "Pseudonyme fachliche Referenz; bleibt Personendatum.", None),
            ("sportart", "string", "Primäre Sportart.", "sportart"),
            ("verband_referenz", "string", "Zuständiger Sportverband.", "sportverband"),
            ("entwicklungsphase", "string", "Fachliche Entwicklungsphase; FTEM-Ausprägungen vor Verwendung bestätigen.", None))),
        ("Foerdermassnahme", None, "massnahme_id ist eindeutig; n:1 zu Athletprofil.", (
            ("massnahme_id", "string", "Eindeutige Kennung der Fördermassnahme.", None),
            ("athlet_referenz", "string", "n:1-Referenz auf Athletprofil.athlet_referenz.", None),
            ("massnahme_typ", "string", "Z. B. Trainingsunterstützung, Beratung oder Infrastrukturzugang.", None),
            ("beginn", "date", "Beginn der Massnahme.", None),
            ("ende", "date", "Geplantes oder tatsächliches Ende.", None),
            ("trainingsziel", "string", "Fachliches Entwicklungsziel ohne medizinischen Befund.", "training"))),
        ("Leistungserhebung", "leistungsdiagnostik", "erhebung_id ist eindeutig; n:1 zu Athletprofil. Messverfahren und Einheit müssen gemeinsam interpretiert werden.", (
            ("erhebung_id", "string", "Eindeutige Kennung der Erhebung.", None),
            ("athlet_referenz", "string", "n:1-Referenz auf Athletprofil.athlet_referenz.", None),
            ("erhebungsdatum", "date", "Datum der Leistungserhebung.", None),
            ("messgroesse", "string", "Bezeichnung der sportlichen Messgrösse; keine Diagnose.", "leistungsdiagnostik"),
            ("messwert", "decimal", "Numerischer Wert im beschriebenen Messverfahren.", None),
            ("einheit", "string", "Fachliche Einheit des Messwerts.", None))),
    )),
    ("sportfinanzhilfen", "Sportförderung – Gesuche und Finanzhilfen", "sportpolitik", "Fördergesuche von Sportorganisationen und zugehörige Beiträge. Ein Antragsteller hat 0..n Gesuche; ein Gesuch hat 0..n Beiträge. Entwurf ohne verbindliche Zusicherungs- oder Anspruchsregeln.", (
        ("Antragsteller", None, "antragsteller_id ist eindeutig; Sportverband, Sportverein oder andere berechtigte Organisation; 1:n zu Fördergesuch.", (
            ("antragsteller_id", "string", "Fachliche Kennung der antragstellenden Organisation.", None),
            ("name", "string", "Organisationsname.", None),
            ("organisationstyp", "string", "Z. B. Sportverband oder Sportverein.", None),
            ("kanton_code", "string", "Sitzkanton der Organisation.", None))),
        ("Foerdergesuch", None, "gesuch_id ist eindeutig; n:1 zu Antragsteller, 1:n zu Beitrag.", (
            ("gesuch_id", "string", "Eindeutige Kennung des Gesuchs.", None),
            ("antragsteller_id", "string", "n:1-Referenz auf Antragsteller.antragsteller_id.", None),
            ("foerderbereich", "string", "Fachlicher Förderbereich, z. B. Sportanlagen oder Sportfördermassnahmen.", None),
            ("eingangsdatum", "date", "Datum des Gesuchseingangs.", None),
            ("beantragt_chf", "decimal", "Beantragter Betrag in CHF, nicht negativ.", "finanzhilfe"),
            ("status", "string", "Fachlicher Bearbeitungsstatus.", None))),
        ("Beitrag", "finanzhilfe", "beitrag_id ist eindeutig; n:1 zu Fördergesuch. Bewilligung und Auszahlung bleiben getrennte Sachverhalte.", (
            ("beitrag_id", "string", "Eindeutige Kennung des Beitrags.", None),
            ("gesuch_id", "string", "n:1-Referenz auf Foerdergesuch.gesuch_id.", None),
            ("bewilligt_chf", "decimal", "Bewilligter Betrag in CHF, nicht negativ.", "finanzhilfe"),
            ("entscheid_datum", "date", "Datum des dokumentierten Entscheids.", None),
            ("ausbezahlt_chf", "decimal", "Bisher ausbezahlter Betrag in CHF, nicht negativ.", "finanzhilfe"),
            ("beitragsjahr", "integer", "Jahr, dem der Beitrag fachlich zugeordnet ist.", None))),
    )),
)

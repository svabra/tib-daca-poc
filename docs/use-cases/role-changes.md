# UC: Änderung der Rollen

## Ziel und Geltungsbereich

Eine Person kann eine Verwaltungsrolle oder Objektverantwortung ändern, ohne die frühere
Zuordnung aus der Nachvollziehbarkeit zu verlieren. Dieser Use Case umfasst die
Organisationsrollen `data_owner`, `deputy_data_owner` und `data_steward`, direkte
Objektverantwortungen sowie Owner und Stellvertretung von Domänen, logischen Modellversionen
und Datenprodukten. Datenzugriffsfreigaben und deren Policies haben eigene Workflows.

## Beteiligte und Vorbedingungen

- Eine angemeldete Person nutzt einen bestehenden, für die jeweilige Ressource autorisierten
  Änderungsweg. Die vorhandenen fachlichen Freigaben und Rollenprüfungen gelten weiterhin.
- Die Migration `0028_role_change_protocol` ist installiert. Sie legt einen ausdrücklich
  gekennzeichneten Anfangsbestand der zu diesem Zeitpunkt aktiven Zuordnungen an.
- Die zu ändernde Person, Rolle und der Organisations- oder Objektbereich sind eindeutig.

## Standardablauf

1. Die zuständige Person öffnet den vorhandenen Änderungsweg, etwa eine Domänenänderung.
2. Die API prüft die bestehende Berechtigung und speichert die Änderung in einer Transaktion.
3. Ein PostgreSQL-Trigger vergleicht den Zustand vor und nach der Änderung. Nur eine fachlich
   relevante Differenz erzeugt ein Ereignis `assigned`, `changed` oder `removed`.
4. Jedes Ereignis erhält eine fortlaufende `sequence`, Zeitpunkt, betroffene Person und Rolle,
   Bereich, vorherigen und neuen Zustand sowie die angemeldete ausführende Person. Änderungen
   ohne lokale Demo-Identität werden ausdrücklich als `system` gekennzeichnet.
5. Unter **Einstellungen → Rollenprotokoll** liest eine angemeldete Person die für sie sichtbaren
   Bereiche in absteigender Sequenz. Die geladenen Einträge lassen sich filtern; ältere
   Einträge können seitenweise nachgeladen werden.
6. Die drei Zuständigkeitsperspektiven zeigen den aktuellen Zustand. Die Protokollansicht zeigt
   zusätzlich, wie dieser Zustand seit Beginn des Protokolls verändert wurde.

## Varianten und Fehlerfälle

- Eine unveränderte Speicherung erzeugt keinen Protokolleintrag.
- Wird eine Zuordnung deaktiviert oder gelöscht, entsteht ein Entzugsereignis; die vorherige
  Zuweisung bleibt erhalten. Das Löschen einer bereits inaktiven Zeile erzeugt keinen zweiten Entzug.
- Wird die Transaktion zurückgerollt, wird auch ihr Protokolleintrag zurückgerollt.
- Eine direkte `UPDATE`-, `DELETE`- oder `TRUNCATE`-Operation auf dem Protokoll wird durch
  einen Datenbank-Trigger abgewiesen. Ein Datenbankeigentümer kann Trigger oder Tabellen
  administrativ verändern; der PoC ersetzt kein externes revisionssicheres Archiv.
- Bestehende Zuordnungen haben keinen rekonstruierbaren historischen Änderungsakteur und werden
  deshalb als `baseline` mit Akteur `migration` angezeigt, ohne frühere Änderungen zu erfinden.
- Die Lese-API filtert die Ereignisse über dieselben sichtbaren Objekte und Organisationen wie
  die Zuständigkeitsübersicht. Verborgene Datenprodukte erscheinen nicht über das Protokoll.

## Akzeptanzkriterien

1. Zuweisung, Änderung und Entzug derselben Rolle bleiben als getrennte, aufsteigend nummerierte
   Ereignisse in PostgreSQL erhalten, auch wenn der aktuelle Zuordnungsdatensatz gelöscht wird.
2. Ein direktes SQL-`UPDATE` oder `DELETE` an einer überwachten Rollentabelle wird ebenfalls
   protokolliert; ein direkter Eingriff in die Ereignistabelle wird abgewiesen.
3. Die Anzeige nennt Sequenz, Zeitpunkt, Aktion, Person, Rolle, Bereich und Akteur. Änderungen
   zeigen die geänderten Werte; das Nachladen verwendet die Sequenz als Cursor.
4. Die Journey **Zugriff und Verantwortung im Überblick behalten** verbindet die drei
   Perspektiven mit diesem Protokoll und erklärt die Grenze zum Datenzugriff.

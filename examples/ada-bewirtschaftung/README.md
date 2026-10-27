# AdA-Bewirtschaftung: physisches Importbeispiel

Modellvorschlag für die administrative Bewirtschaftung von Angehörigen der Armee (AdA),
Schweiz. **11 Tabellen, 62 Felder, drei vollständig fiktive Personen.** Dies ist kein offizielles
Armee-, PISA- oder Dienstmanager-Schema und keine Anbindung an ein solches System.

| Datei | Verwendung |
|---|---|
| [ada_bewirtschaftung.csv](ada_bewirtschaftung.csv) | In DaCa importierbares Strukturinventar, UTF-8, Semikolon |
| [schema.sql](schema.sql) | Ausführbares PostgreSQL-Schema mit Schlüsseln, Prüfregeln, Indizes und Kommentaren |
| [beispieldaten.sql](beispieldaten.sql) | Fiktive Referenzwerte, Personen und Verwaltungsabläufe |
| [build.py](build.py) | Gemeinsame Definition für CSV und DDL; erneut erzeugen oder `--check` |
| [validate.py](validate.py) | CSV-Kompatibilität und echte PostgreSQL-Constraint-Prüfungen |

## Journey in DaCa

Unter **Dokumentation → User Journeys** findest du die Kachel **Import physisches Datenmodell – AdA**
mit einer Anleitung in sechs Schritten. Der **…**-Knopf auf dieser Kachel sowie oben in der
Detailanleitung neben Dauer und Stufe öffnet dasselbe Journey-Menü. Mit
**AdA-Beispielinventar herunterladen** erhältst du dieselbe CSV wie in diesem Verzeichnis.
**AdA-Import zurücksetzen** lässt dich die Organisation wählen und zeigt das betroffene Inventar
vor der Bestätigung. Es entfernt ausschliesslich den Import dieser Beispieldatei, einschliesslich
seiner Strukturen. Danach öffnet sich der leere Importdialog im gleichen Organisationsbereich.
Logische Modelle, Zuordnungen und historische Verknüpfungen verhindern den Reset; das Auditprotokoll
bleibt erhalten. Andere Quellen und Inventare werden nicht zurückgesetzt. Der Dateiname oder
Inventarname allein entscheidet nicht über den Reset: massgeblich sind Inhalt und Organisation.

Der entsprechende lokale Befehl lautet:

```powershell
# Vorschau, ohne den Beispielimport zu entfernen:
npm run journey:ada:reset -- --demo-user christian.man
# Den angezeigten Beispielimport zurücksetzen:
npm run journey:ada:reset -- --demo-user christian.man --yes
```

Standard: `http://127.0.0.1:4217`, Departement `VBS`, Organisation `vbs-verteidigung`.
Mit `--base-url`, `--department` und `--organization` lässt sich eine andere lokale Instanz bzw.
ein anderer berechtigter Organisationsbereich wählen. Der Server muss lokale Demo-Anmeldung
erlauben; er prüft die Rolle der gewählten Demo-Person erneut. Der Befehl verwendet HTTP und
Sitzungscookies, keine direkte Datenbankverbindung. Verknüpfungs- oder Revisionsfehler werden
angezeigt und nicht durch einen erzwungenen Reset umgangen. Ist kein Beispielimport vorhanden,
ist der Reset bereits erledigt. Bei einem erneuten Import wird ein frischer Snapshot angelegt.

1. Als Data Steward **Datenmodelle** oder **Datenquellen** öffnen.
2. **Strukturinventar aus CSV laden** wählen.
3. `ada_bewirtschaftung.csv` in die markierte Fläche ziehen oder über die Dateiauswahl öffnen.
4. Name **AdA – Bewirtschaftung (Modellvorschlag)** und den zuständigen Organisationsbereich
   wählen; für die lokale Demonstration **VBS · Verteidigung**.
5. Vorschau auf **11 physische Modelle / 62 Felder** prüfen, Tabellen durchsuchen und
   Originalangaben einsehen. Abbrechen erzeugt keinen Quelleintrag.
6. **Importieren** wählen. DaCa öffnet das gespeicherte Inventar mit Tabellen und Spalten.
   Es ist anschliessend im Quellenregister sichtbar. Ein identischer Import im selben Bereich
   wird wiederverwendet. Bei Bedarf lässt sich aus einer Tabelle ein logisches Modell ableiten.

Importiert werden ausschliesslich Strukturmetadaten. Die SQL-Dateien werden durch den Import
weder ausgeführt noch als Datensätze geladen. Das Inventar erhält keine Datenbankverbindung.
Die Tabelle heisst im CSV beispielsweise `angehoeriger`; das ausführbare SQL verwendet den
Namensraum `ada_bewirtschaftung`. `System` gruppiert alle Tabellen unter `AdA Administration Demo`.

Der vorhandene DaCa-CSV-Vertrag verlangt `Tabelle;Feldname;Datentyp`. Beschreibungen, Längen,
Wertelisten und vorgeschlagene Klassifizierungen werden mitgeliefert. Zusätzliche Angaben zu
Primär-/Fremdschlüsseln, Nullwerten und Defaults bleiben als CSV-Originale erhalten. Sie werden
gegenwärtig **nicht** in die strukturierten Snapshot-Constraints projiziert. Die Vorschau weist
deshalb auf unbekannte Nullability hin, obwohl das Originalfeld `Null erlaubt` vorhanden ist.
Verbindliche technische Constraints für dieses Beispiel stehen in `schema.sql`.
Die CSV-Klassifizierung ist ein Metadatenvorschlag und erzeugt keine Zugriffsrechte.

## Fachlicher Umfang und Beziehungen

Personen referenzieren einen administrativen Status. Einteilungen und Gradverlauf bilden
zeitliche Änderungen ab. Aufgebote verbinden eine Person mit einer Dienstleistung; eine
Dienstteilnahme dokumentiert den tatsächlichen Verlauf. Qualifikationen referenzieren einen
Qualifikationstyp und optional die Dienstleistung des Erwerbs.

```mermaid
erDiagram
  personalstatus ||--o{ angehoeriger : status
  angehoeriger ||--o{ einteilung : hat
  organisationseinheit ||--o{ einteilung : umfasst
  organisationseinheit o|--o{ organisationseinheit : uebergeordnet
  angehoeriger ||--o{ gradverlauf : hat
  militaergrad ||--o{ gradverlauf : bezeichnet
  organisationseinheit ||--o{ dienstleistung : verwaltet
  angehoeriger ||--o{ aufgebot : erhaelt
  dienstleistung ||--o{ aufgebot : betrifft
  aufgebot ||--o| dienstteilnahme : dokumentiert
  angehoeriger ||--o{ qualifikation : erwirbt
  qualifikationstyp ||--o{ qualifikation : bezeichnet
  dienstleistung o|--o{ qualifikation : erworben_in
```

Alle UUIDs werden vom schreibenden Client gesetzt. Fremdschlüssel verhindern das Löschen
referenzierter Stammdaten. Ein Aufgebot pro Person und Dienstleistung und eine Teilnahme pro
Aufgebot sind eindeutig. Zeitintervalle und nichtnegative Diensttage werden geprüft.
`geaendert_am` muss durch die Anwendung aktualisiert werden; es gibt keinen automatischen Trigger.
Überlappende Einteilungen/Gradintervalle, mehrstufige Organisationszyklen, Gültigkeitsdauer über
Tabellengrenzen und die fachliche Anrechnung von Diensttagen sind bewusst noch keine automatisierten
Regeln. Dafür ist eine Fachklärung erforderlich. Statuswerte sind Demonstrationswerte.

Nicht enthalten sind AHV-/amtliche Personalnummern, Gesundheits- oder Disziplinardaten,
Waffenverwaltung, Einsatzorte oder eine produktive Personenverwaltung. `DEMO-AdA-*` sind
synthetische Referenzen. Für einen produktiven Einsatz fehlen unter anderem freigegebene
Fachregeln, Aufbewahrungs-/Löschregeln und die Berechtigungsprojektion des Quellsystems.
Die Aufnahme dieses Inventars verändert keine DaCa-Anwendungsdatenbanktabellen.

## Lokale technische Prüfung

`uv run python examples/ada-bewirtschaftung/build.py --check` prüft die erzeugten Dateien.
SQL-Schema und Beispieldaten lassen sich nacheinander in einer leeren, eigens dafür angelegten
PostgreSQL-Datenbank ausführen. Das Validierungsskript akzeptiert ausschliesslich die Datenbank
`daca_ada_model_test`, legt kein produktives Schema an und löscht keine Daten:

```powershell
$env:ADA_MODEL_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/daca_ada_model_test'
uv run --all-packages python examples/ada-bewirtschaftung/validate.py
```

## Fachliche Orientierung

Der Vorschlag orientiert sich an den öffentlich beschriebenen Verwaltungsbereichen, ohne deren
interne Schnittstellen oder Datenstrukturen zu behaupten. Gradbezeichnungen wurden als kleine,
nicht abschliessende Beispielmenge aus der [offiziellen Armeeübersicht](https://www.armee.ch/de/militaerdienst-sold)
übernommen. Die [SAT-Admin-Seite der Armee](https://www.vtg.admin.ch/de/sat-admin-app)
verwendet die Bezeichnung AdA und ordnet den Dienstmanager im digitalen Verwaltungskontext ein.
Stand der Quellenprüfung: 27.10.2026.

# ADR 0005: Physische Modelle aus PostgreSQL und S3/Parquet

Status: angenommen (PoC)

## Kontext

Logische Modelle benötigen eine technische Gegenstelle für Ableitungen, Mappings und Drift. Diese Gegenstelle ist nicht zwingend eine relationale Tabelle: Im DAAIF-Umfeld liegen kuratierte Daten auch als Parquet in einem S3-kompatiblen Object Store.

## Entscheid

DaCa bezeichnet die importierte, mappingfähige Struktur einer Datenquelle als **physisches Modell**.

- PostgreSQL liefert Tabellen, Views und deren Spalten über `information_schema` und `pg_catalog`.
- S3 liefert Parquet-Objekte und deren Felder aus dem eingebetteten Parquet-Schema.
- Beide Varianten werden in denselben unveränderlichen Snapshot-, Drift- und Mappingtabellen gespeichert.
- Der Katalog durchsucht ausschließlich seine lokal importierten Metadaten in PostgreSQL. Eine Suche löst keinen Zugriff auf die Datenquelle aus.
- S3-Endpunkt, Bucket, Prefix und Zugangsdaten werden ausschließlich serverseitig konfiguriert. Zugangsdaten gelangen weder in API-Antworten noch in Auditdaten.
- Der S3-Adapter listet Objekte und liest Parquet-Metadaten; er materialisiert keine Datenzeilen.

Der PoC kann denselben S3-kompatiblen Speicher wie DAAIF verwenden. DaCa ruft DAAIF dabei nicht auf und besitzt keine Laufzeitabhängigkeit zum DAAIF-Service. Der Zugriff erfolgt direkt auf den konfigurierten Object Store.

## Protokollgrenze

Dieser Entscheid ergänzt S3 über HTTPS ausschließlich als **serverseitige Metadatenquelle**. DaCa stellt keinen S3-Datenendpunkt bereit und übernimmt keine Produktbereitstellung. HTTP/REST und PostgreSQL bleiben die unterstützten Protokolle für die Auslieferung von Datenprodukten.

## Konsequenzen

- Nutzer erkennen im Mapping, ob ein Feld aus einer PostgreSQL-Relation oder aus einem Parquet-Objekt stammt.
- Stable Keys für Parquet verwenden `s3://bucket/key#field`; DaCa speichert keine I14Y-MappingTables dafür.
- Ein Parquet-Objekt wird im bestehenden relationalen Modell als `physical_table.kind = parquet` repräsentiert. Dies ist eine gemeinsame strukturelle Abstraktion und behauptet nicht, dass S3 relational ist.
- Weitere Dateiformate benötigen einen eigenen Architekturentscheid und einen belastbaren Schemaextraktionsvertrag.

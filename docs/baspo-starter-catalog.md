# BASPO starter catalog

Delivered in release **0.3.14** (16 November 2026), with matching DE/EN version
notes and the previous release preserved in the searchable archive.

The additive `baspo-starter-catalog-v1` onboarding reuses `vbs-baspo` and attaches
the formerly flat office to **VBS**. Roland Maestro (`roland.maestro`) and Davide
Partito (`davide.partito`) are selectable BASPO **Data Owner** personas, each with
an explicit BASPO modeling assignment, federal directory entry and primary
membership. Their `example.invalid` contacts are placeholders, not verified email
addresses or production identities.

## Scope and responsibilities

| Domain | Primary Data Owner | Deputy Data Owner | Initial term memberships |
|---|---|---|---:|
| Sportpolitik und Sportförderung | Roland Maestro | Davide Partito | 5 |
| Jugend+Sport | Roland Maestro | Davide Partito | 9 |
| Breiten- und Erwachsenensport | Roland Maestro | Davide Partito | 8 |
| Sportbildung und Qualifikationen | Roland Maestro | Davide Partito | 6 |
| Nachwuchs- und Leistungssport | Davide Partito | Roland Maestro | 8 |
| Sportanlagen und Sportzentren | Davide Partito | Roland Maestro | 5 |
| Sportwissenschaft und Leistungsdiagnostik | Davide Partito | Roland Maestro | 4 |
| Fairer und sicherer Sport | Davide Partito | Roland Maestro | 3 |

There are **30 distinct terms**, some assigned to more than one domain, and
**40 editorial term relationships**. `broader` denotes a genuine general concept;
operational connections use `related`. The complete internal network is connected
and its hierarchy is acyclic. The source of truth for the reviewed starter content
is `services/catalog-api/src/daca_catalog/baspo_content.py`.

## Research and provenance

Research was performed on **16 November 2026**. The domain and model proposals
follow the BASPO's [tasks and objectives](https://www.baspo.admin.ch/de/aufgaben-und-ziele-des-baspo),
[sport promotion](https://www.baspo.admin.ch/de/sportfoerderung), and
[competitive sport support](https://www.baspo.admin.ch/de/leistungssportforderung).
The J+S proposals also use the current [coach guidance](https://www.jugendundsport.ch/de/leitfaden-coach)
and [qualification guidance](https://www.jugendundsport.ch/de/weisung-kaderbildung).
These are editorial catalog proposals, not a claim to reproduce official BASPO
or Nationale Datenbank Sport (NDS) database schemas.

All **30 German preferred designations** and the BASPO organization name were
verified against specific **TERMDAT** entries, mainly the Sportschule Magglingen
and SPORT18 collections. The public v2 API exposes only a subset of those
collections; the additional evidence was read from the public TERMDAT website's
HTTP entry endpoints. Runtime onboarding is entirely offline and reproducible.

`fixtures/baspo_termdat.json` records entry IDs, public entry links, collection,
modification time, retrieval time, original source status and attested designations.
Source status `0` remains in progress and `1` validated: the ribbon does not claim
every external entry is validated. Original definitions were deliberately not
imported. Some are dated, including a J+S age description; the local summaries
follow current BASPO/J+S evidence and are explicitly marked editorial.

Each term has an `exactMatch` link to its TERMDAT entry and a versioned external
reference with a hashed designation snapshot. The term cards and term-network
cards display a **TERMDAT ribbon** linking to that entry. The tooltip distinguishes
the sourced designation from the editorial description. A ribbon requires an
explicit exact match to an HTTPS entry on the recognized TERMDAT hosts; similar
spellings, `related` links and arbitrary external websites do not qualify.

## Logical models

| Identifier | Draft logical model | Primary domain | Entities |
|---|---|---|---|
| BASPO-001 | Jugend+Sport – Angebote und Teilnahme | Jugend+Sport | Organisator, Angebot, Teilnahme |
| BASPO-002 | J+S – Ausbildung und Anerkennungen | Sportbildung und Qualifikationen | Kaderperson, Ausbildungsangebot, Anerkennung |
| BASPO-003 | Sportanlagen – Inventar und Belegungen | Sportanlagen und Sportzentren | Standort, Sportanlage, Belegung |
| BASPO-004 | Nachwuchs- und Leistungssport – Förderverlauf | Nachwuchs- und Leistungssport | Athletprofil, Foerdermassnahme, Leistungserhebung |
| BASPO-005 | Sportförderung – Gesuche und Finanzhilfen | Sportpolitik und Sportförderung | Antragsteller, Foerdergesuch, Beitrag |

Every model contains three entities, typed fields, descriptions, business
identifiers and documented reference cardinalities. Matching entities/fields link
to published starter business-object versions. Generic entities such as Angebot
(course or camp) and Antragsteller (association, club or other organization) are
not incorrectly equated to one narrower terminology object. Entity relationships
are documented in comments and reference-field descriptions; the existing
logical-model persistence does not have a separate ER foreign-key definition.

The models remain **draft**, assigned through `DcatDatasetVersion.data_domain_id`
to an active BASPO domain. They can be opened from that domain's model list.
Proposed person references are pseudonymous, and sensitive identifiers and
measurements carry confidential field classifications; no actual people,
participation records or medical results are loaded. Domain Owners must review
the proposals before publication. BASPO supplies physical representations and
subsequent mappings itself. No BASPO physical source, snapshot, product endpoint,
access policy or data grant is provisioned.

## Apply and verify

Normal image startup (`daca-catalog-seed`) and optional application startup
seeding both apply this onboarding, including to an existing catalog. To apply
only this package to an existing, migrated runtime:

```powershell
docker compose exec -T catalog-api uv run --no-sync python -m daca_catalog.baspo_seed
```

The package commits with its caller. Its marker prevents subsequent runs from
overwriting edited labels, changing later ownership, recreating revoked roles,
reactivating people or restoring retired objects. Stable `baspo:` UUID keys and
`urn:daca:*:baspo:*` identifiers prevent duplicates. No network calls occur while
seeding. Audit and database role-change evidence use the existing mechanisms.

Focused verification covers source integrity, domain assignments, graph
connectivity/acyclicity, flat-office repair, both primary Data Owner roles,
model/business-object references, absence of physical provisioning, and replay
after editorial changes and revocation. The standard UI regression remains the
required commit gate.
Its logical-first flow waits for the asynchronous business-object choices before
selecting them, including when starter packages add further published concepts.

Verified on 16 November 2026: the four BASPO source/onboarding/replay tests, five
related seed regressions, 34 targeted Angular tests, the production container
build, Ruff, data-model documentation drift check and the complete
`npm run test:ui-regression` passed. Browser inspection confirmed both BASPO
profiles, ribbons in card/network views, typed logical fields and the domain's
logical-model list with zero physical representations.

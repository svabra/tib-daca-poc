# Catalog interface languages

The catalog supports German (`de`), French (`fr`), Italian (`it`), Romansh Grischun
(`rm`) and English (`en`). RM is available in the header and Settings / Language.
Changing the language applies immediately, including the document's `lang` attribute.
The existing confirmation offers browser-only or profile-wide storage; cancelling restores
the previous language. Browser overrides remain per person and take precedence over a
profile preference. The API validates all five codes. Saving a language merges the existing
`DemoUser.preferences` JSON under its row lock, preserving unrelated preferences and layouts.
No migration or preference key is introduced.

`catalog-copy.ts` holds the existing four-language central copy;
`catalog-rm.ts` provides a compile-time-complete Romansh translation of every central key.
Tests verify interpolation parameters too. `catalog-localization.ts` shares these translations
with the older inline-copy components, with additional Romansh text for the application shell,
settings, data landscape and recent work. Untranslated inline detail copy falls back to its
existing English text; legacy German-only editors and supplied business content are not
automatically translated. The release archive remains German/English, as for French/Italian.
`Data Owner` remains the role label in every language.

Organization-network projections include `rm` without changing canonical IDs or codes.
Stored registry labels take precedence. The read-only ASTRA fallback is **UVIAS – Uffizi
federal da vias**; contextual groups, canton prefixes and public-enterprise labels also have
Romansh display names. Missing registry translations fall back to a short code; business
names, product metadata, domain names, user names and source values retain their recorded
language. Switching languages does not refetch the graph or modify personal layout drafts.

Data-landscape counts share `organizationCountLabel` across focus headings, organization-card
accessible labels, the text list, domain tooltips/accessible labels and relationship descriptions.
Offered products, consumed products and catalog relationships have separate singular/plural
forms. `Intl.PluralRules` selects cardinal forms for all five locales, including French zero
(`one`) and Romansh zero (`other`). Compact card counts remain numeric with the existing
supply/consumption arrows and legend. No product counts, visibility or access semantics change.

Reference terminology and cardinal rules:

- [Federal Chancellery: Romansh](https://www.bk.admin.ch/rm/rumantsch)
- [Federal Administration: legal information and data protection](https://www.admin.ch/rm/infurmaziuns-giuridicas)
- [Federal Department of Finance: organization](https://www.efd.admin.ch/rm/organisaziun)
- [Federal Administration: department names and abbreviations](https://www.admin.ch/rm/administraziun-federale-departaments)
- [Federal geodata: UVIAS designation](https://api3.geo.admin.ch/rest/services/api/MapServer/ch.astra.unfaelle-personenschaeden_alle/legend?lang=rm)
- [Unicode CLDR cardinal rules](https://unicode.org/cldr/charts/48/supplemental/language_plural_rules.html)

Validation covers all central keys, interpolation, per-user browser/profile restore, settings
selection, 0/1/2 count forms in five languages and component-level count surfaces. The Edge
organization-localization regression also exercises RM, profile save and restore after reload,
localized organization names, fullscreen exit and mobile overflow, and unchanged canonical
graph/layout state. It restores the original profile and browser preference after the test.

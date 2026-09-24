# Personal settings in DaCa

DaCa follows the DAAIF settings layout: one page heading and a persistent context navigation beside
the active panel. The header gear opens `/settings`, which redirects to `/settings/features`. The
context navigation contains `/settings/language-personal`, `/settings/appearance`, and
`/settings/features`, plus `/settings/responsibilities` for the catalog's three responsibility
perspectives. There is no tenant language setting because DaCa does not use tenants.

The header gear and day/night control expose visible, translated tooltips on hover and keyboard
focus. Their accessible names convey the same action. The header language selector and the
personal language settings page both call `UserPreferencesService.requestLanguage`; the interface
changes immediately and the dialog then asks whether to save only in this browser or in the user
profile. Cancelling restores the previous language. The appearance page offers explicit light and
dark choices through `requestTheme`; the same dialog confirms the storage scope before the theme
changes. The header day/night control uses the same service.

The feature list keeps the existing searchable, versioned release history inside the settings
layout. Its popup link still opens `/settings/features` directly. These routes require an active
local user session, as does every other DaCa page.

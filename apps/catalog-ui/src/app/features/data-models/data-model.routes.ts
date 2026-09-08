import { Routes } from '@angular/router';

export const DATA_MODEL_ROUTES: Routes = [
  { path: 'models', pathMatch: 'full', loadComponent: () => import('./logical-models-overview.component').then((m) => m.LogicalModelsOverviewComponent), data: { preload: true }, title: 'Datenmodelle | DaCa' },
  { path: 'models/new', pathMatch: 'full', loadComponent: () => import('./logical-model-editor.component').then((m) => m.LogicalModelEditorComponent), title: 'Neues logisches Modell | DaCa' },
  { path: 'models/:id/mappings', pathMatch: 'full', loadComponent: () => import('./mapping-workspace.component').then((m) => m.MappingWorkspaceComponent), title: 'Zuordnungen | DaCa' },
  { path: 'models/:id/drift', pathMatch: 'full', loadComponent: () => import('./mapping-workspace.component').then((m) => m.MappingWorkspaceComponent), data: { view: 'drift' }, title: 'Drift | DaCa' },
  { path: 'models/:id', loadComponent: () => import('./logical-model-editor.component').then((m) => m.LogicalModelEditorComponent), title: 'Logisches Modell | DaCa' },
  { path: 'physical-models', pathMatch: 'full', loadComponent: () => import('./physical-assets.component').then((m) => m.PhysicalAssetsComponent), title: 'Physische Modelle | DaCa' },
  { path: 'mappings', pathMatch: 'full', loadComponent: () => import('./mapping-workspace.component').then((m) => m.MappingWorkspaceComponent), title: 'Mapping-Arbeitsplatz | DaCa' },
];

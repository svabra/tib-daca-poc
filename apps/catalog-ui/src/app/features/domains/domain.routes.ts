import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

export const DOMAIN_ROUTES: Routes = [
  { path:'domains/network', pathMatch:'full', redirectTo:({queryParams})=>inject(Router).createUrlTree(['/domains'],{queryParams:{...queryParams,view:'network'}}) },
  { path: 'domains', pathMatch: 'full', runGuardsAndResolvers:(from,to)=>from.queryParamMap.get('view')!==to.queryParamMap.get('view'), canDeactivate:[(component:{canDeactivate:()=>boolean})=>component.canDeactivate()], loadComponent: () => import('./domains-glossary.component').then((m) => m.DomainsGlossaryComponent), data: { preload: true, semanticTab: 'domains' }, title: 'Domänen | DaCa' },
  { path: 'domains/terminology', pathMatch: 'full', canDeactivate:[(component:{canDeactivate:()=>boolean})=>component.canDeactivate()], loadComponent: () => import('./domains-glossary.component').then((m) => m.DomainsGlossaryComponent), data: { semanticTab: 'terms' }, title: 'Terminology | DaCa' },
  { path: 'domains/glossary', pathMatch: 'full', redirectTo: 'domains/terminology' },
  { path: 'domains/concepts', pathMatch: 'full', loadComponent: () => import('./i14y-concepts.component').then((m) => m.I14yConceptsComponent), title: 'I14Y-Konzepte | DaCa' },
  { path: 'domains/themes', pathMatch: 'full', loadComponent: () => import('./i14y-themes.component').then((m) => m.I14yThemesComponent), title: 'I14Y-Themen | DaCa' },
  { path: 'domains/governance', pathMatch: 'full', loadComponent: () => import('./domains-glossary.component').then((m) => m.DomainsGlossaryComponent), data: { semanticTab: 'governance' }, title: 'Semantik-Governance | DaCa' },
  { path: 'domains/:id', canDeactivate: [(component: {canDeactivate:()=>boolean}) => component.canDeactivate()], loadComponent: () => import('./domain-detail.component').then((m) => m.DomainDetailComponent), title: 'Domain | DaCa' },
  { path: 'glossary/proposals/new', loadComponent: () => import('./glossary-proposal-new.component').then((m) => m.GlossaryProposalNewComponent), title: 'Term vorschlagen | DaCa' },
  { path: 'glossary/proposals/:id/review', loadComponent: () => import('./glossary-review.component').then((m) => m.GlossaryReviewComponent), title: 'Termvorschlag prüfen | DaCa' },
];

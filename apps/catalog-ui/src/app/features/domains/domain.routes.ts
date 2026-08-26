import { Routes } from '@angular/router';

export const DOMAIN_ROUTES: Routes = [
  { path: 'domains', pathMatch: 'full', loadComponent: () => import('./domains-glossary.component').then((m) => m.DomainsGlossaryComponent), data: { preload: true }, title: 'Domains & Glossar | DaCa' },
  { path: 'domains/:id', loadComponent: () => import('./domain-detail.component').then((m) => m.DomainDetailComponent), title: 'Domain | DaCa' },
  { path: 'glossary/proposals/new', loadComponent: () => import('./glossary-proposal-new.component').then((m) => m.GlossaryProposalNewComponent), title: 'Term vorschlagen | DaCa' },
  { path: 'glossary/proposals/:id/review', loadComponent: () => import('./glossary-review.component').then((m) => m.GlossaryReviewComponent), title: 'Termvorschlag prüfen | DaCa' },
];

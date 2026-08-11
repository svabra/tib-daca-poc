import { ApplicationConfig, inject, isDevMode } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { PreloadingStrategy, provideRouter, Route, withComponentInputBinding, withPreloading } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { Observable, of } from 'rxjs';
import { routes } from './app.routes';

export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] === true ? load() : of(null);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch()),
    provideRouter(routes, withComponentInputBinding(), withPreloading(SelectivePreloadingStrategy)),
    SelectivePreloadingStrategy,
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

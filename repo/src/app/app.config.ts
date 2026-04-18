import { ApplicationConfig, importProvidersFrom, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { FormsModule } from '@angular/forms';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    importProvidersFrom(FormsModule),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};

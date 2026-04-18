import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const root = document.querySelector('fc-root');
    if (root) {
      root.textContent = 'FlowCanvas failed to start. Please reload the page.';
    }
  }
  throw err;
});

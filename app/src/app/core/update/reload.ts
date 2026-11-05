import { InjectionToken } from '@angular/core';

/** Page reload. Tests override this so a service-worker update cannot refresh the runner. */
export const APP_RELOAD = new InjectionToken<() => void>('APP_RELOAD', {
  providedIn: 'root',
  factory: () => () => {
    globalThis.location.reload();
  },
});

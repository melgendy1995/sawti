import { Routes } from '@angular/router';

/**
 * Feature routes are lazy-loaded. `speak` is the default route.
 * `/storage` is intentionally unmatched until P0.6 and falls through to `**`.
 */
export const routes: Routes = [
  {
    path: 'speak',
    loadComponent: () => import('./features/speak/speak').then((m) => m.Speak),
  },
  {
    path: 'audio/diagnostics',
    loadComponent: () => import('./features/audio/diagnostics').then((m) => m.AudioDiagnostics),
  },
  {
    path: 'audio',
    loadComponent: () => import('./features/audio/audio').then((m) => m.AudioBoard),
  },
  { path: '', pathMatch: 'full', redirectTo: 'speak' },
  { path: '**', redirectTo: 'speak' },
];

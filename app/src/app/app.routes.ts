import { Routes } from '@angular/router';

/**
 * Feature routes are lazy-loaded. Only `speak` is implemented in the P0.3
 * skeleton; the rest arrive in P1+. `speak` is the default route.
 */
export const routes: Routes = [
  {
    path: 'speak',
    loadComponent: () => import('./features/speak/speak').then((m) => m.Speak),
  },
  { path: '', pathMatch: 'full', redirectTo: 'speak' },
  { path: '**', redirectTo: 'speak' },
];

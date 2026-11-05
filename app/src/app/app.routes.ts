import { Routes } from '@angular/router';
import { caregiverGateGuard } from './core/access/caregiver-guard';

/**
 * Feature routes are lazy-loaded. `speak` is the default route.
 * `/storage` is the P0.6 iOS storage soak page (lazy, so speak budgets hold).
 * `/voice` is the P0.5 anonymous rating page (lazy, same reason).
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
  {
    path: 'storage',
    loadComponent: () => import('./features/storage/storage').then((m) => m.StoragePage),
  },
  {
    path: 'voice',
    loadComponent: () => import('./features/voice/voice').then((m) => m.VoicePage),
  },
  {
    path: 'settings',
    canActivate: [caregiverGateGuard],
    loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage),
  },
  {
    path: 'profiles',
    canActivate: [caregiverGateGuard],
    loadComponent: () => import('./features/profiles/profiles').then((m) => m.ProfilesPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'speak' },
  { path: '**', redirectTo: 'speak' },
];

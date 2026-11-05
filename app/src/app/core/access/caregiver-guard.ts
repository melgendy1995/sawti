import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CaregiverGate } from './caregiver-gate';

/** Settings and profiles stay closed until the in-memory caregiver session is open. */
export const caregiverGateGuard: CanActivateFn = () => {
  if (inject(CaregiverGate).unlocked()) return true;
  return inject(Router).createUrlTree(['/speak']);
};

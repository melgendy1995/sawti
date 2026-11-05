import { InjectionToken } from '@angular/core';

import { SawtiDb } from './sawti-db';

/** The app database. Tests may override this with a uniquely named `SawtiDb`. */
export const SAWTI_DB = new InjectionToken<SawtiDb>('SAWTI_DB', {
  providedIn: 'root',
  factory: () => new SawtiDb(),
});

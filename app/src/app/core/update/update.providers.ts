import { inject, provideAppInitializer } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { UpdateService } from './update.service';
import { VersionCheck } from './version-check';

/** Starts the launch update check and the daily version.json read. */
export function provideSawtiUpdates(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const updates = inject(UpdateService);
    const versions = inject(VersionCheck);
    return Promise.all([updates.checkOnLaunch(), versions.check()]).then(() => undefined);
  });
}

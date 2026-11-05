import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';
import { useGlobalIndexedDb } from '../storage/use-global-indexeddb';

useGlobalIndexedDb();
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { SAWTI_DB } from '../storage/db-token';
import { SawtiDb } from '../storage/sawti-db';
import { CaregiverGate } from './caregiver-gate';

describe('caregiverGateGuard', () => {
  let db: SawtiDb;

  beforeEach(() => {
    db = new SawtiDb(`sawti-guard-${crypto.randomUUID()}`);
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: SAWTI_DB, useValue: db }],
    });
  });

  afterEach(async () => {
    const name = db.name;
    db.close();
    await SawtiDb.delete(name);
  });

  it('refuses settings and profiles while locked, and allows them after unlock', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);

    await harness.navigateByUrl('/settings');
    expect(router.url).toBe('/speak');

    await harness.navigateByUrl('/profiles');
    expect(router.url).toBe('/speak');

    await harness.navigateByUrl('/backup');
    expect(router.url).toBe('/speak');

    const gate = TestBed.inject(CaregiverGate);
    expect(await gate.submitPin('1357', '1357')).toBe(true);

    await harness.navigateByUrl('/settings');
    expect(router.url).toBe('/settings');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('الإعدادات');

    await harness.navigateByUrl('/profiles');
    expect(router.url).toBe('/profiles');

    await harness.navigateByUrl('/backup');
    expect(router.url).toBe('/backup');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('النسخ الاحتياطي');

    gate.lock();
    await harness.navigateByUrl('/settings');
    expect(router.url).toBe('/speak');
  });
});

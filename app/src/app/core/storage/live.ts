import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Signal } from '@angular/core';

/** Domain code must not import this file. Do not wire it into app routes or speak. */
export function liveSignal<T>(query: () => T | Promise<T>, initial: T): Signal<T> {
  return toSignal(from(liveQuery(query)), { initialValue: initial });
}

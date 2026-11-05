import { Injectable, signal } from '@angular/core';
import type { SpokenPart } from './speak-contract';

/** In-memory sentence. Never written to Dexie, localStorage, or a file. */
@Injectable({ providedIn: 'root' })
export class SentenceStore {
  private readonly items = signal<readonly SpokenPart[]>([]);
  readonly parts = this.items.asReadonly();

  append(part: SpokenPart): void {
    this.items.update((parts) => [...parts, part]);
  }

  deleteLast(): void {
    this.items.update((parts) => (parts.length === 0 ? parts : parts.slice(0, -1)));
  }

  clear(): void {
    this.items.set([]);
  }
}

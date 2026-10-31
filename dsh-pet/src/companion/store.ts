/** Atomic, recoverable companion storage. Never replace damaged data with an empty store. */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  readdirSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
/** Store validated JSON with rolling recovery copies. Each store has a single synchronous writer. */
export class RecoverableStore<T> {
  private readonly root: string;
  private readonly name: string;
  private readonly validate: (value: unknown) => value is T;
  constructor(root: string, name: string, validate: (value: unknown) => value is T) {
    this.root = root;
    this.name = name;
    this.validate = validate;
  }
  /** Missing data initializes only when neither a live file nor a recovery copy exists. */
  read(initial: () => T): T {
    const file = join(this.root, this.name + '.json');
    const dir = join(this.root, 'snapshots');
    const copies = existsSync(dir)
      ? readdirSync(dir)
          .filter((n) => n.startsWith(this.name + '-') && n.endsWith('.json'))
          .sort()
          .reverse()
      : [];
    let damaged = false;
    for (const path of [file, ...copies.map((n) => join(dir, n))]) {
      if (!existsSync(path)) continue;
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (!this.validate(parsed)) throw new Error('Invalid schema');
        if (path !== file) {
          if (existsSync(file)) copyFileSync(file, file + '.corrupt-' + Date.now());
          this.write(parsed);
        }
        return parsed;
      } catch {
        damaged = true;
      }
    }
    if (damaged) throw new Error('Companion storage is damaged and no valid snapshot is available: ' + file);
    return initial();
  }
  /** Publish complete bytes by rename; snapshot before the next mutation can overwrite them. */
  write(value: T): void {
    if (!this.validate(value)) throw new Error('Refusing invalid companion data');
    mkdirSync(this.root, { recursive: true });
    const file = join(this.root, this.name + '.json');
    const raw = JSON.stringify(value, null, 2);
    writeFileSync(file + '.tmp', raw, 'utf8');
    renameSync(file + '.tmp', file);
    const dir = join(this.root, 'snapshots');
    mkdirSync(dir, { recursive: true });
    const latest = join(dir, this.name + '-latest.json');
    writeFileSync(latest + '.tmp', raw, 'utf8');
    renameSync(latest + '.tmp', latest);
    const cutoff = Date.now() - 30 * 86400000;
    for (const name of readdirSync(dir)) {
      const prefix = this.name + '-';
      if (!name.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}\.json$/.test(name.slice(prefix.length))) continue;
      if (new Date(name.slice(prefix.length, -5)).getTime() < cutoff) unlinkSync(join(dir, name));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const snapshot = join(dir, this.name + '-' + stamp + '.json');
    if (!existsSync(snapshot)) {
      writeFileSync(snapshot + '.tmp', raw, 'utf8');
      renameSync(snapshot + '.tmp', snapshot);
    }
  }
}

import path from "path";
import fs from "fs/promises";
import { type Database } from "better-sqlite3";
import invariant from "tiny-invariant";

export type MigrationEntry = {
  id: string;
  name: string;
  applied_at: string;
};

export type MigratorOptions = {
  dry: boolean;
};

export class Migrator {
  constructor(
    public db: Database,
    public dir: string,
    public options: MigratorOptions = { dry: false },
  ) {
    this.initFs();
    this.initDb();
  }

  /**
   * Create a new migration with the given name
   *
   * @param name Migration name like "add users" or "create users index"
   */
  async create(name: string, upSql: string, downSql: string) {
    let ts = timestamp();
    let migrationName = `${ts}-${sanitizeName(name)}`;

    let up = path.join(migrationName, "+.sql");
    let down = path.join(migrationName, "-.sql");

    let dirPath = path.join(this.dir, migrationName);
    let upPath = path.join(this.dir, up);
    let downPath = path.join(this.dir, down);

    if (!this.options.dry) {
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(upPath, upSql);
      await fs.writeFile(downPath, downSql);
    }

    return { name: migrationName, up, down };
  }

  async up(to?: string): Promise<string[]> {
    let pending = await this.getPendingMigrations();

    if (to) {
      let idx = pending.findIndex(m => m.startsWith(to));
      if (idx === -1) {
        throw new Error(`Migration ${to} not found`);
      }
      pending = pending.slice(0, idx + 1);
    }

    if (pending.length === 0) {
      return [];
    }

    let migrated: string[] = [];

    for (let migration of pending) {
      let file = await this.runMigration(migration, "up");
      migrated.push(file);
    }

    return migrated;
  }

  async rollback(steps = 1): Promise<string[]> {
    if (steps < 1) {
      return [];
    }

    let applied = await this.getAppliedMigrations();
    if (steps > applied.length) {
      steps = applied.length;
    }

    if (steps === 0) {
      return [];
    }

    let toRollback = applied.slice(-steps).reverse();
    if (toRollback.length === 0) {
      return [];
    }

    let migrations = await fs.readdir(this.dir);
    let map = new Map(migrations.map(f => [f.split("-")[0], f]));
    let migrated: string[] = [];

    for (let entry of toRollback) {
      let migration = map.get(entry.id);
      invariant(migration, `Migration file for ${entry.id} not found`);
      migrated.push(await this.runMigration(migration, "down"));
    }

    return migrated;
  }

  private async runMigration(migration: string, direction: "up" | "down") {
    let fileName = path.join(migration, direction === "up" ? "+.sql" : "-.sql");
    let sqlFile = path.join(this.dir, fileName);
    let sql = await fs.readFile(sqlFile, "utf8");
    let id = migration.split("-")[0];
    let db = this.db;

    let query;
    try {
      // validate sql even for dry runs
      query = db.prepare(sql);
    } catch (error) {
      console.error(`Error preparing sql for migration: ${fileName}`);
      throw error;
    }

    if (!this.options.dry) {
      db.transaction(() => {
        query.run();
        if (direction === "up") {
          db.prepare(
            "INSERT INTO _migralite (id, name, applied_at) VALUES (?, ?, ?)",
          ).run(id, fileName, new Date().toISOString());
        } else {
          db.prepare("DELETE FROM _migralite WHERE id = ?").run(id);
        }
      })();
    }

    return fileName;
  }

  private async initFs() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private async initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migralite (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getPendingMigrations() {
    let applied = (await this.getAppliedMigrations()).map(row => row.id);
    let files = await fs.readdir(this.dir);
    return files.filter(f => !applied.includes(f.split("-")[0])).sort();
  }

  async getAppliedMigrations() {
    let entries = this.db
      .prepare("SELECT id, name, applied_at FROM _migralite ORDER BY id ")
      .all() as MigrationEntry[];
    return entries;
  }
}

////////////////////////////////////////////////////////////////////////////////

function sanitizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric chars with dash
    .replace(/^-+|-+$/g, "") // Remove leading/trailing dashes
    .replace(/-{2,}/g, "-"); // Replace multiple dashes with single dash
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

export function validateSql(sql: string) {
  if (!sql || sql.trim() === "") {
    throw new Error("SQL file is empty or invalid");
  }
}

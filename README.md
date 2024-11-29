# Migralite

A type-safe database migration tool for SQLite. Manage your database schema changes with timestamped migrations through a CLI or API interface.

## Features

- ✨ Simple CLI interface for managing migrations
- 🔄 Bidirectional migrations (up/down)
- 📁 File-based migrations with timestamps
- 🔍 Dry-run mode for validating changes
- 📊 Migration status tracking
- 🔒 Type-safe TypeScript implementation

## Installation

```bash
npm install @ryanflorence/migralite
```

## CLI Usage

The CLI provides several commands for managing your database migrations:

### Create a New Migration

```bash
migralite create -n "add users table"
```

This creates a new migration directory with two files:

- `+.sql`: The up migration (apply changes)
- `-.sql`: The down migration (rollback changes)

### Apply Migrations

Apply all pending migrations:

```bash
migralite up
```

Apply migrations up to a specific one:

```bash
migralite up 20240329123000
```

### Rollback Migrations

Rollback the most recent migration:

```bash
migralite rollback
```

Rollback multiple migrations:

```bash
migralite rollback --steps 3
```

### Check Migration Status

```bash
migralite status
```

### Environment Variables

- `MIGRATIONS_DIR`: Directory for migration files (default: `./db/migrations`)
- `DB_PATH`: Path to SQLite database file (default: `./db/database.db`)

## Programmatic API

The migration tool can also be used programmatically in your Node.js applications.

### Basic Usage

```typescript
import { Migrator } from "@ryanflorence/migralite";
import Database from "better-sqlite3";

let db = new Database("path/to/database.db");
let migrator = new Migrator(db, "path/to/migrations");

// Apply all pending migrations
await migrator.up();

// Rollback last migration
await migrator.rollback();
```

### API Reference

#### `Migrator` Class

```typescript
class Migrator {
  constructor(db: Database, dir: string, options?: { dry: boolean });
}
```

##### Methods

###### `create(name: string, upSql: string, downSql: string)`

Creates a new migration.

```typescript
let result = await migrator.create(
  "add-users-table",
  "CREATE TABLE users (...)",
  "DROP TABLE users",
);
// Returns: { name: string, up: string, down: string }
```

###### `up(to?: string)`

Applies pending migrations.

```typescript
// Apply all pending migrations
let applied = await migrator.up();

// Apply up to specific migration
let applied = await migrator.up("20240329123000");
// Returns: string[] (applied migration files)
```

###### `rollback(steps?: number)`

Rolls back applied migrations.

```typescript
// Rollback last migration
let rolledBack = await migrator.rollback();

// Rollback multiple migrations
let rolledBack = await migrator.rollback(3);
// Returns: string[] (rolled back migration files)
```

###### `getPendingMigrations()`

Gets list of pending migrations.

```typescript
let pending = await migrator.getPendingMigrations();
// Returns: string[]
```

###### `getAppliedMigrations()`

Gets list of applied migrations.

```typescript
let applied = await migrator.getAppliedMigrations();
// Returns: MigrationEntry[]
```

#### Types

```typescript
type MigrationEntry = {
  id: string;
  name: string;
  applied_at: string;
};

type MigratorOptions = {
  dry: boolean;
};
```

## Migration File Structure

Each migration is stored in a timestamped directory:

```
migrations/
  └─ 20240329123000-add-users/
     ├─ +.sql  # Up migration
     └─ -.sql  # Down migration
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

import path from "path";
import Database from "better-sqlite3";
import fs from "fs/promises";
import { Migrator } from "./lib/migrate.js";
import arg from "arg";
import pc from "picocolors";

const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR || path.join(process.cwd(), "db", "migrations");

const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "db", "database.db");

const args = arg({
  "--help": Boolean,
  "--dry": Boolean,
  "--name": String,
  "--steps": Number,
  "-h": "--help",
  "-n": "--name",
  "-d": "--dry",
  "-s": "--steps",
});

const commands = {
  create: async (name?: string) => {
    if (!name) {
      console.log(pc.red("Error: Migration name is required"));
      process.exit(1);
    }

    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);

    const migrator = new Migrator(db, MIGRATIONS_DIR, { dry: !!args["--dry"] });
    const upSql = `-- Up migration for ${name}`;
    const downSql = `-- Down migration for ${name}`;

    try {
      const result = await migrator.create(name, upSql, downSql);
      console.log(pc.green("✓ Migration created"));
      console.log(
        pc.dim("Location:"),
        pc.white(path.join(MIGRATIONS_DIR, result.name)),
      );
      console.log(pc.dim("Files:"));
      console.log(pc.dim("  ├─"), pc.white(result.up));
      console.log(pc.dim("  └─"), pc.white(result.down));
    } catch (error) {
      console.log(pc.red(`Error creating migration, error below`));
      throw error;
    } finally {
      db.close();
    }
  },

  up: async (to?: string) => {
    const db = new Database(DB_PATH);
    const migrator = new Migrator(db, MIGRATIONS_DIR, { dry: !!args["--dry"] });

    try {
      const migrations = await migrator.up(to);
      if (!migrations || migrations.length === 0) {
        console.log(pc.yellow("ℹ No pending migrations to apply"));
        return;
      }

      console.log(
        pc.green(
          `✓ Applied ${migrations.length} migration${migrations.length > 1 ? "s" : ""}`,
        ),
      );
      console.log(pc.dim("Applied files:"));
      for (let [i, file] of migrations.entries()) {
        const isLast = i === migrations.length - 1;
        console.log(pc.dim(isLast ? "  └─" : "  ├─"), pc.white(file));
      }
    } catch (error) {
      console.log(pc.red(`Error applying migrations, error below`));
      throw error;
    } finally {
      db.close();
    }
  },

  rollback: async (steps?: number) => {
    const db = new Database(DB_PATH);
    const migrator = new Migrator(db, MIGRATIONS_DIR, { dry: !!args["--dry"] });

    try {
      const migrations = await migrator.rollback(steps || 1);
      if (!migrations || migrations.length === 0) {
        console.log(pc.yellow("ℹ No migrations to roll back"));
        return;
      }

      console.log(
        pc.green(
          `✓ Rolled back ${migrations.length} migration${migrations.length > 1 ? "s" : ""}`,
        ),
      );
      console.log(pc.dim("Rolled back files:"));
      migrations.forEach((file, i) => {
        const isLast = i === migrations.length - 1;
        console.log(pc.dim(isLast ? "  └─" : "  ├─"), pc.white(file));
      });
    } catch (error) {
      console.log(pc.red(`Error rolling back migrations, error below`));
      throw error;
    } finally {
      db.close();
    }
  },

  status: async () => {
    const db = new Database(DB_PATH);
    const migrator = new Migrator(db, MIGRATIONS_DIR, { dry: !!args["--dry"] });

    try {
      const applied = await migrator.getAppliedMigrations();
      const pending = await migrator.getPendingMigrations();

      console.log(pc.dim("Database migration status:"));
      console.log(
        pc.green(
          `✓ ${applied.length} applied migration${applied.length !== 1 ? "s" : ""}`,
        ),
      );
      console.log(
        pc.yellow(
          `ℹ ${pending.length} pending migration${pending.length !== 1 ? "s" : ""}`,
        ),
      );
      console.log();
      console.log(pc.dim("Latest applied migration:"));
      console.log(pc.dim("  └─"), pc.white(applied[applied.length - 1].name));
    } catch (error) {
      console.log(pc.red(`Error checking migration status, error below`));
      throw error;
    } finally {
      db.close();
    }
  },

  help: () => {
    console.log(`
${pc.bold("Migralite")}

${pc.dim("Environment variables:")}
  MIGRATIONS_DIR    Directory for migration files
  DB_PATH          Path to SQLite database file

${pc.dim("Commands:")}
  create -n <name>      Create a new migration
  up                    Apply pending migrations
  up --to <name>        Apply migrations up to a specific migration
  rollback              Roll back applied migrations
  rollback --steps <n>  Roll back the last n migrations
  status                Show migration status

${pc.dim("Options:")}
  -h, --help     Show this help message
  -d, --dry      Dry run (validate without applying changes)
  -n, --name     Migration name (for create command)
  -s, --steps    Number of migrations to roll back (default: 1)

${pc.dim("Examples:")}
  Create:   migralite create -n "add users table"
  Up:       migralite up
  Rollback: migralite rollback --steps 2
  Status:   migralite status
    `);
  },
};

async function main() {
  if (args["--help"]) {
    commands.help();
    return;
  }

  const command = args._[0];

  if (args["--dry"]) {
    console.log(pc.yellow("🔎Dry run"));
    console.log();
  }

  switch (command) {
    case "create":
      await commands.create(args["--name"]);
      break;
    case "up":
      await commands.up(args._[1]);
      break;
    case "rollback":
      await commands.rollback(args["--steps"]);
      break;
    case "status":
      await commands.status();
      break;
    default:
      console.log(pc.red("Error: Invalid command"));
      commands.help();
      process.exit(1);
  }
}

main().catch(error => {
  console.log(pc.red(`Unexpected error, error below`));
  throw error;
});

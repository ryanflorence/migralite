import assert from "node:assert";
import { afterEach, test, describe } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { Migrator } from "./migrate.js";

const TEST_DIR = await fs.mkdtemp("test");

afterEach(async () => {
  // wipe out the DB
  new Database(":memory:").close();
  // remove the migrations dir
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe("create", () => {
  test("creates new migration", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    let upSql = "CREATE TABLE users (id INTEGER, name TEXT)";
    let downSql = "DROP TABLE users";
    let migration = await stubTimestamp("01", () =>
      migrator.create("add users", upSql, downSql),
    );

    assert.deepEqual(migration, {
      name: `01-add-users`,
      up: `01-add-users/+.sql`,
      down: `01-add-users/-.sql`,
    });

    // check directory
    const dirs = await fs.readdir(TEST_DIR);
    assert.equal(dirs.length, 1);
    assert.equal(dirs[0], `01-add-users`);

    // check files
    const migrationDir = path.join(TEST_DIR, dirs[0]);
    const files = await fs.readdir(migrationDir);
    assert.ok(files.includes("+.sql"));
    assert.ok(files.includes("-.sql"));

    // check file contents
    const upContent = await fs.readFile(
      path.join(migrationDir, "+.sql"),
      "utf8",
    );
    const downContent = await fs.readFile(
      path.join(migrationDir, "-.sql"),
      "utf8",
    );
    assert.equal(upContent, upSql);
    assert.equal(downContent, downSql);
  });
});

describe("up", () => {
  test("no migrations to run", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    let migrated = await migrator.up();
    assert.deepEqual(migrated, []);
  });

  test("migrates all from blank slate", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    let a = await stubTimestamp("01", () => {
      let upSql = "CREATE TABLE users (id INTEGER, name TEXT);";
      let downSql = "DROP TABLE users;";
      return migrator.create("add users", upSql, downSql);
    });

    let b = await stubTimestamp("02", () => {
      let upSql2 = "CREATE TABLE posts (id INTEGER, title TEXT);";
      let downSql2 = "DROP TABLE posts;";
      return migrator.create("add posts", upSql2, downSql2);
    });

    let migrated = await migrator.up();

    // check output
    assert.deepEqual(migrated, [a.up, b.up]);

    // check database
    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();

    assert.deepEqual(tables, [
      { name: "migrations" },
      { name: "posts" },
      { name: "users" },
    ]);
  });

  test("migrates to specific migration from blank slate", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    let a = await stubTimestamp("01", () => {
      let upSql = "CREATE TABLE users (id INTEGER, name TEXT);";
      let downSql = "DROP TABLE users;";
      return migrator.create("add users", upSql, downSql);
    });

    await stubTimestamp("02", () => {
      let upSql2 = "CREATE TABLE posts (id INTEGER, title TEXT);";
      let downSql2 = "DROP TABLE posts;";
      return migrator.create("add posts", upSql2, downSql2);
    });

    await migrator.up(a.name);

    // check database
    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();

    assert.deepEqual(tables, [{ name: "migrations" }, { name: "users" }]);
  });

  test("migrates all pending migrations", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    // add a migration and run it
    await stubTimestamp("01", () =>
      migrator.create(
        "add users",
        "CREATE TABLE users (id INTEGER, name TEXT)",
        "",
      ),
    );
    await migrator.up();

    // add a pending migration
    await stubTimestamp("02", () =>
      migrator.create(
        "add posts",
        "CREATE TABLE posts (id INTEGER, title TEXT)",
        "",
      ),
    );

    // run it
    await migrator.up();

    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();

    assert.deepEqual(tables, [
      { name: "migrations" },
      { name: "posts" },
      { name: "users" },
    ]);
  });

  test("migrates to specific version", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    // add a migration and run it
    await stubTimestamp("01", () =>
      migrator.create(
        "add users",
        "CREATE TABLE users (id INTEGER, name TEXT)",
        "",
      ),
    );
    await migrator.up();

    // add two pending migrations
    let subject = await stubTimestamp("02", () =>
      migrator.create(
        "add posts",
        "CREATE TABLE posts (id INTEGER, title TEXT)",
        "",
      ),
    );

    await stubTimestamp("03", () =>
      migrator.create(
        "add comments",
        "CREATE TABLE comments (id INTEGER, body TEXT)",
        "",
      ),
    );

    // run it
    await migrator.up(subject.name);

    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();

    assert.deepEqual(tables, [
      { name: "migrations" },
      { name: "posts" },
      { name: "users" },
    ]);
  });
});

describe("rollback", () => {
  test("rolls back one migration", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    let a = await stubTimestamp("01", () => {
      let upSql = "CREATE TABLE users (id INTEGER, name TEXT);";
      let downSql = "DROP TABLE users;";
      return migrator.create("add users", upSql, downSql);
    });

    await migrator.up();

    let rolledBack = await migrator.rollback();

    assert.deepEqual(rolledBack, [a.down]);

    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();

    assert.deepEqual(tables, [{ name: "migrations" }]);
  });

  test("rolls back multiple migrations", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    await stubTimestamp("01", () => {
      let upSql = "CREATE TABLE users (id INTEGER, name TEXT);";
      let downSql = "DROP TABLE users;";
      return migrator.create("add users", upSql, downSql);
    });

    await stubTimestamp("02", () => {
      let upSql = "CREATE TABLE posts (id INTEGER, name TEXT);";
      let downSql = "DROP TABLE posts;";
      return migrator.create("add posts", upSql, downSql);
    });

    await migrator.up();

    let rolledBack = await migrator.rollback(2);
    assert.deepEqual(rolledBack, ["02-add-posts/-.sql", "01-add-users/-.sql"]);

    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();
    assert.deepEqual(tables, [{ name: "migrations" }]);
  });

  test("no migrations to rollback", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    let rolledBack = await migrator.rollback();
    assert.deepEqual(rolledBack, []);
  });

  test("negative steps runs no migrations", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    await stubTimestamp("01", () => {
      let up = "CREATE TABLE users (id INTEGER, name TEXT);";
      let down = "DROP TABLE users;";
      return migrator.create("add users", up, down);
    });

    await migrator.up();

    let rolledBack = await migrator.rollback(-1);
    assert.deepEqual(rolledBack, []);

    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();
    assert.deepEqual(tables, [{ name: "migrations" }, { name: "users" }]);
  });

  test("zero steps runs no down migrations", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    await stubTimestamp("01", () => {
      let up = "CREATE TABLE users (id INTEGER, name TEXT);";
      let down = "DROP TABLE users;";
      return migrator.create("add users", up, down);
    });

    await migrator.up();

    let rolledBack = await migrator.rollback(0);
    assert.deepEqual(rolledBack, []);

    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();
    assert.deepEqual(tables, [{ name: "migrations" }, { name: "users" }]);
  });

  test("steps > applied migrations runs all down migrations", async () => {
    let db = new Database(":memory:");
    let migrator = new Migrator(db, TEST_DIR);

    await stubTimestamp("01", () =>
      migrator.create(
        "add users",
        "CREATE TABLE users (id INTEGER, name TEXT)",
        "DROP TABLE users",
      ),
    );

    await migrator.up();

    // rollback 2 migrations even though we only have 1
    let rolledBack = await migrator.rollback(2);
    assert.deepEqual(rolledBack, ["01-add-users/-.sql"]);

    let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
    let tables = db.prepare(q).all();
    assert.deepEqual(tables, [{ name: "migrations" }]);
  });
});

test("dry doesn't write to the db", async () => {
  let db = new Database(":memory:");
  let migrator = new Migrator(db, TEST_DIR, { dry: true });

  let a = await stubTimestamp("01", () => {
    let upSql = "CREATE TABLE users (id INTEGER, name TEXT);";
    let downSql = "DROP TABLE users;";
    return migrator.create("add users", upSql, downSql);
  });

  let migrated = await migrator.up();

  // returns the migration that would have been run
  assert.deepEqual(migrated, [a.up]);

  let q = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
  let tables = db.prepare(q).all();
  // doesn't write to the db
  assert.deepEqual(tables, [{ name: "migrations" }]);
});

////////////////////////////////////////////////////////////////////////////////

function stubTimestamp<T>(ts: string, fn: () => T) {
  let timestamp = Date.prototype.toISOString;
  Date.prototype.toISOString = () => ts;
  let ret = fn();
  Date.prototype.toISOString = timestamp;
  return ret;
}

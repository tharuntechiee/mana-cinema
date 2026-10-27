// Where the project and its database live. Kept apart from db.js, which opens the database as soon as it is
// imported: index.js needs the path first, to put a saved copy in place (snapshot.js).
import "./env.js";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const DB_FILE = process.env.DATABASE_FILE ? path.resolve(ROOT, process.env.DATABASE_FILE) : path.join(DATA_DIR, "mana-cinema.db");

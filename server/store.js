// Stockage JSON persistant (fichiers dans ./data). Interface volontairement simple
// pour pouvoir être remplacée par PostgreSQL (voir README) sans toucher aux routes.
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.GRIOT_DATA_DIR || path.resolve("data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function file(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

export function save(name, value) {
  const tmp = file(name) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file(name));
  return value;
}

export function update(name, fallback, fn) {
  const current = load(name, fallback);
  const next = fn(current) ?? current;
  return save(name, next);
}

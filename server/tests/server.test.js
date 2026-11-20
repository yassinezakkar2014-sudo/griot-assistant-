import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.GRIOT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "griot-"));

const { extractText, markdownToDocx } = await import("../documents.js");
const { load, save, update } = await import("../store.js");
const { upsertProject, systemPrompt, GAME_ACTIONS } = await import("../griot.js");

test("extraction CSV / texte", async () => {
  const out = await extractText(Buffer.from("a,b\n1,2"), "data.csv", "text/csv");
  assert.equal(out.kind, "CSV");
  assert.match(out.text, /1,2/);
});

test("génération .docx", async () => {
  const buf = await markdownToDocx("Rapport", "# Titre\n- point **important**\nTexte");
  assert.ok(buf.length > 1000);
  assert.equal(buf.subarray(0, 2).toString(), "PK"); // archive OOXML
});

test("stockage JSON", () => {
  save("t", { a: 1 });
  assert.deepEqual(load("t", {}), { a: 1 });
  update("t", {}, (d) => void (d.b = 2));
  assert.deepEqual(load("t", {}), { a: 1, b: 2 });
});

test("projets + prompt système", () => {
  upsertProject({ name: "Marque", status: "en cours", task: "Logo" });
  upsertProject({ name: "marque", complete_task: "logo" });
  const p = systemPrompt({ mode: "business" });
  assert.match(p, /Marque \[en cours\]/);
  assert.match(p, /BUSINESS/);
  assert.ok(GAME_ACTIONS.includes("fly_to"));
});

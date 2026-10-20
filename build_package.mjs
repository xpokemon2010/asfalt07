#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const exists = async (path) => { try { await access(path, constants.F_OK); return true; } catch { return false; } };
const sourceDir = await exists(join(root, 'src', 'index.html')) ? join(root, 'src') : root;
const outputDir = await exists(join(root, 'deploy')) ? join(root, 'deploy') : root;
const cars = JSON.parse(await readFile(join(sourceDir, 'cars.json'), 'utf8'));
const required = ['id', 'name', 'type', 'shape', 'power', 'grip', 'weight', 'max', 'color'];
const shapes = new Set(['coupe', 'sedan', 'track', 'hatch', 'rally', 'classic', 'electric', 'muscle']);
if (!Array.isArray(cars) || cars.length === 0) throw new Error('cars.json must be a non-empty array');
const ids = new Set();
for (const [index, car] of cars.entries()) {
  const missing = required.filter((field) => !(field in car));
  if (missing.length) throw new Error(`Vehicle #${index + 1} is missing: ${missing.join(', ')}`);
  if (ids.has(car.id)) throw new Error(`Duplicate vehicle id: ${car.id}`);
  ids.add(car.id);
  if (!shapes.has(car.shape)) throw new Error(`Unsupported shape for ${car.id}: ${car.shape}`);
  for (const field of ['power', 'grip', 'weight', 'max']) {
    if (typeof car[field] !== 'number' || car[field] <= 0) throw new Error(`${field} must be positive for ${car.id}`);
  }
}
const htmlPath = join(sourceDir, 'index.html');
const templatePath = join(sourceDir, 'worker.template.js');
let html = await readFile(htmlPath, 'utf8');
let template = await readFile(templatePath, 'utf8');
if (html.split('__CAR_CONFIG_JSON__').length !== 2) throw new Error('Expected one __CAR_CONFIG_JSON__ placeholder in index.html');
if (template.split('__APP_HTML_BASE64__').length !== 2 || template.split('__PLAYER_SPECS_JSON__').length !== 2) throw new Error('Worker template placeholders missing or duplicated');
html = html.replace('__CAR_CONFIG_JSON__', JSON.stringify(cars));
const playerSpecs = Object.fromEntries(cars.map(({ id, power, grip, weight, max }) => [id, { power, grip, weight, max }]));
template = template.replace('__APP_HTML_BASE64__', Buffer.from(html, 'utf8').toString('base64'));
template = template.replace('__PLAYER_SPECS_JSON__', JSON.stringify(playerSpecs));
const outputPath = resolve(outputDir, 'worker.js');
await writeFile(outputPath, template, 'utf8');
console.log(`Built ${outputPath}: ${cars.length} vehicle presets, ${Buffer.byteLength(html)} client bytes, ${Buffer.byteLength(template)} Worker bytes.`);

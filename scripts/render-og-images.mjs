import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const WIDTH = 1200;
const HEIGHT = 630;
const VARIANTS = {
  fr: { output: 'public/og-fr.png', replacements: [] },
  en: { output: 'public/og-en.png', replacements: [
    ['Donne Ton Point', 'Give Your Point'],
    ["Le rituel d'équipe pour s'offrir points et gages.", 'The team ritual of points and dares.'],
    ['🚨 GAGE : VIENNOISERIES', '🚨 DARE: PASTRIES'],
  ] },
};

const source = await readFile('public/og.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

for (const [language, { output, replacements }] of Object.entries(VARIANTS)) {
  const svg = replacements.reduce((text, [from, to]) => text.replaceAll(from, to), source);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: output, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log(`${language} → ${output}`);
}

await browser.close();

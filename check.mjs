// Runnable check for the resume site's content and safety rules (spec: docs/superpowers/specs/2026-10-17-resume-site-design.md).
// Usage: node check.mjs   (exit 0 = every rule holds; exit 1 = one line per failure)
import { readFileSync, existsSync, statSync } from 'node:fs';

const fails = [];
const read = f => (existsSync(f) ? readFileSync(f, 'utf8') : (fails.push(`missing file: ${f}`), ''));
const nonEmpty = f => { if (!existsSync(f) || statSync(f).size === 0) fails.push(`missing or empty: ${f}`); };

const published = ['index.html', 'styles.css', 'motion.js', 'stamp3d.js'];
const text = Object.fromEntries(published.map(f => [f, read(f)]));

for (const [f, t] of Object.entries(text)) {
  if (/[\u2013\u2014]/.test(t)) fails.push(`${f}: contains an em or en dash`);
  if (/Grenier/.test(t)) fails.push(`${f}: contains "Grenier"`);
  if (/705-5125/.test(t)) fails.push(`${f}: contains the phone number`);
  if (/open to contract/i.test(t)) fails.push(`${f}: contains "open to contract"`);
  if (/fonts\.(googleapis|gstatic)\.com/.test(t)) fails.push(`${f}: requests Google Fonts`);
  if (/<script[^>]+src=["']https?:/i.test(t)) fails.push(`${f}: loads a remote script`);
  if (/url\(\s*["']?https?:/i.test(t)) fails.push(`${f}: loads a remote CSS url()`);
}

const mustHave = [
  'Jonah Butterbaugh', 'Expedia Group', 'JPMorgan Chase', 'USAA', 'Fraud Forensic Replay',
  'Private repository', 'demo on request', 'CFE', 'one business day',
  'jonah.m.butterbaugh@gmail.com', 'linkedin.com/in/jonah-butterbaugh-2288033b1', 'github.com/gmrmk',
  'Jonah_Butterbaugh_Resume.pdf', 'aria-hidden="true"', '<main', 'lang="en"',
];
const page = text['index.html'].toLowerCase();
for (const s of mustHave) if (!page.includes(s.toLowerCase())) fails.push(`index.html: missing "${s}"`);

for (const s of ['prefers-reduced-motion', '@media print']) if (!text['styles.css'].includes(s)) fails.push(`styles.css: missing "${s}"`);

for (const f of ['fonts/special-elite-400.woff2', 'fonts/courier-prime-400.woff2', 'fonts/courier-prime-700.woff2',
  'fonts/archivo-black-400.woff2', 'fonts/OFL.txt', 'Jonah_Butterbaugh_Resume.pdf']) nonEmpty(f);

if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
console.log('check.mjs: all rules hold');

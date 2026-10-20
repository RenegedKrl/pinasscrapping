const fs = require('fs');
const path = require('path');

const dotenv = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = dotenv.match(/GEMINI_API_KEY=(.+)/)[1].trim().replace(/['"]/g, '');

const testList = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.8-flash'
];

async function run() {
  for (const m of testList) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Responda OK' }] }] })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`[SUCCESS] ${m}: ${data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()}`);
      } else {
        console.log(`[FAIL] ${m}: HTTP ${res.status} - ${data.error?.message?.slice(0, 70)}`);
      }
    } catch (err) {
      console.log(`[ERR] ${m}: ${err.message}`);
    }
  }
}
run();

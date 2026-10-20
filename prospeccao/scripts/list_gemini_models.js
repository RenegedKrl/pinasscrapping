const fs = require('fs');
const path = require('path');

const dotenv = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = dotenv.match(/GEMINI_API_KEY=(.+)/)[1].trim().replace(/['"]/g, '');

async function list() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.models) {
    const names = data.models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    console.log('Available models:');
    console.log(names);
  } else {
    console.log(data);
  }
}
list();

import fs from 'node:fs';
const t = fs.readFileSync('C:/Users/rayhi/AppData/Local/Temp/ekos-main.js', 'utf8');
const i = t.indexOf('indicators:{general:{summary:Z+');
const chunk = t.slice(i - 1200, i + 200);
// find Z= F= L= assignments near api config
const j = t.indexOf('gestaodeoperacoes');
console.log('gestao idx', j);
console.log(t.slice(j - 300, j + 500).replace(/\s+/g, ' '));

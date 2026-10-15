import fs from 'node:fs';
const t = fs.readFileSync('C:/Users/rayhi/AppData/Local/Temp/ekos-main.js', 'utf8');
for (const n of ['api.telemetry', 'telemetry.machine', 'historical/model/2/excel', 'getTelemetry', 'TelemetryService', 'model/2/']) {
  let idx = 0, c = 0;
  while ((idx = t.indexOf(n, idx)) >= 0 && c < 2) {
    console.log('\n---', n, '---');
    console.log(t.slice(Math.max(0, idx - 250), idx + 450).replace(/\s+/g, ' '));
    idx += n.length;
    c++;
  }
}

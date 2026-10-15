import fs from 'node:fs';

const t = fs.readFileSync('C:/Users/rayhi/AppData/Local/Temp/ekos-main.js', 'utf8');

const needles = [
  'historical/model/2',
  'indicators/grouped',
  'buildIndicatorRequestParams',
  'idMachineList',
  'initDateTime',
  'API_ERROR_MISSING_PARAMETER',
  'model/4',
  'subtitle',
];

for (const n of needles) {
  let idx = 0;
  let count = 0;
  while ((idx = t.indexOf(n, idx)) >= 0 && count < 3) {
    console.log('\n---', n, '---');
    console.log(t.slice(Math.max(0, idx - 150), idx + 250).replace(/\s+/g, ' '));
    idx += n.length;
    count += 1;
  }
}

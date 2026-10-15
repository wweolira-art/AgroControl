import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Executa os módulos reais, resolvendo os imports sem extensão usados pelo Metro.
function loadTs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } });
  const exports = {};
  const require = name => {
    assert.ok(name.startsWith('.'), 'A rotina espacial deve usar somente módulos locais.');
    return loadTs(path.resolve(path.dirname(file), `${name}.ts`));
  };
  new Function('require', 'exports', outputText)(require, exports);
  return exports;
}
const { geometryCentroid, findTalhaoAtPoint } = loadTs(fileURLToPath(new URL('../src/maps/spatial.ts', import.meta.url)));

test('centro de Polygon e MultiPolygon usa posições, sem confundir anéis com coordenadas', () => {
  const ring = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert.deepEqual(geometryCentroid({ type: 'Polygon', coordinates: [ring] }), { lng: 2, lat: 2 });
  assert.deepEqual(geometryCentroid({ type: 'MultiPolygon', coordinates: [[ring]] }), { lng: 2, lat: 2 });
  assert.equal(geometryCentroid({ type: 'Polygon', coordinates: [] }), null);
  assert.equal(geometryCentroid({ type: 'MultiPolygon', coordinates: [] }), null);
  assert.equal(geometryCentroid({ type: 'Polygon', coordinates: [[[NaN, 1], [0, Infinity]]] }), null);
});

test('identificação respeita buracos e seleciona o talhão menor em sobreposição', () => {
  const feature = (id, coordinates) => ({ type: 'Feature', properties: { id }, geometry: { type: 'Polygon', coordinates } });
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  const large = feature('grande', [outer, hole]);
  const small = feature('pequeno', [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]);
  const collection = { type: 'FeatureCollection', features: [large, small] };
  assert.equal(findTalhaoAtPoint(collection, 5, 5), null);
  assert.equal(findTalhaoAtPoint(collection, 20, 20), null);
  assert.equal(findTalhaoAtPoint(collection, 2, 2).feature, small);
});

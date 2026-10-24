const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function creatorRoot() {
  if (process.env.COCOS_CREATOR_ROOT) return process.env.COCOS_CREATOR_ROOT;
  const generated = fs.readFileSync('temp/tsconfig.cocos.json', 'utf8');
  const config = JSON.parse(generated);
  const internal = config.compilerOptions.paths['db://internal/*'][0].replace(/\\/g, '/');
  return internal.slice(0, internal.indexOf('/resources/resources/3d/engine'));
}
const root = creatorRoot();
const tsFile = path.join(root, 'resources/app.asar.unpacked/node_modules/typescript/lib/typescript.js');
const tsc = path.join(path.dirname(tsFile), 'tsc.js');
const typecheck = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], { stdio: 'inherit' });
if (typecheck.status !== 0) process.exit(typecheck.status || 1);
console.log('Project TypeScript: PASS (engine declaration checking skipped)');

const ts = require(tsFile);
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS } });
  module._compile(output.outputText, filename);
};
require('../tests/rules.test.cjs');

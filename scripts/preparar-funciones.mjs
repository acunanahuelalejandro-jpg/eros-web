// Prepara archivos autocontenidos para el editor web, sin cambiar los fuentes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const functionsRoot = resolve(root, 'supabase/functions');
const outputRoot = resolve(root, 'supabase/dashboard');
const verification = spawnSync(process.execPath, [resolve(root, 'scripts/verificar-precios.mjs')], { stdio: 'inherit' });
if (verification.status !== 0) process.exit(1);
await mkdir(outputRoot, { recursive: true });

for (const name of ['crear-pago', 'webhook-mercadopago', 'estado-pedido']) {
  const visited = new Set();
  const visiting = new Set();
  const chunks = [];
  async function add(path) {
    if (visited.has(path)) return;
    if (visiting.has(path)) throw new Error('Hay una importación circular: ' + relative(root, path));
    if (!path.startsWith(functionsRoot + sep) || !path.endsWith('.ts')) throw new Error('Solo se permiten módulos locales de funciones.');
    visiting.add(path);
    let source = await readFile(path, 'utf8');
    const imports = [...source.matchAll(/^import\s+[^\n]+?\s+from\s+["']([^"']+)["'];?\s*$/gm)];
    for (const match of imports) {
      if (!match[1].startsWith('.')) throw new Error('Dependencia no local: ' + match[1]);
      await add(resolve(dirname(path), match[1]));
      source = source.replace(match[0], '');
    }
    if (/^import\b/m.test(source)) throw new Error('Importación sin resolver: ' + relative(root, path));
    source = source.replace(/^export\s+/gm, '');
    chunks.push('// Fuente: ' + relative(root, path).split(sep).join('/') + '\n' + source.trim());
    visiting.delete(path); visited.add(path);
  }
  await add(resolve(functionsRoot, name, 'index.ts'));
  const file = resolve(outputRoot, name + '.ts');
  await writeFile(file, '// GENERADO por node scripts/preparar-funciones.mjs. No editar este archivo.\n// No contiene secretos: se leen del entorno de Supabase.\n\n' + chunks.join('\n\n') + '\n');
  console.log('Preparado: ' + relative(root, file));
}

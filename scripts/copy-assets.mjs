import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDirectory = new URL('../dist/', import.meta.url);

async function collectDeclarations(directory, declarations = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) {
      await collectDeclarations(source, declarations);
    } else if (entry.name.endsWith('.d.ts')) {
      declarations.push(source);
    }
  }
  return declarations;
}

function rewriteRelativeSpecifiers(declaration, sourcePath, declarationPaths, runtimeExtension) {
  return declaration.replace(/(\bfrom\s+|\bimport\(\s*)(['"])(\.\.?(?:\/[^'"]+)?)\2/g, (match, prefix, quote, specifier) => {
    if (/\.[a-z0-9]+$/i.test(specifier)) return match;
    const candidate = resolve(dirname(sourcePath), specifier);
    const target = declarationPaths.has(`${candidate}.d.ts`)
      ? `${specifier}.${runtimeExtension}`
      : declarationPaths.has(resolve(candidate, 'index.d.ts'))
        ? `${specifier.replace(/\/$/, '')}/index.${runtimeExtension}`
        : specifier;
    return `${prefix}${quote}${target}${quote}`;
  });
}

async function prepareDeclarations(directory) {
  const declarations = await collectDeclarations(directory);
  const declarationPaths = new Set(declarations.map((source) => fileURLToPath(source)));
  await Promise.all(declarations.map(async (source) => {
    const sourcePath = fileURLToPath(source);
    const declaration = await readFile(source, 'utf8');
    await writeFile(source, rewriteRelativeSpecifiers(declaration, sourcePath, declarationPaths, 'js'));
    await writeFile(
      sourcePath.replace(/\.d\.ts$/, '.d.cts'),
      rewriteRelativeSpecifiers(declaration, sourcePath, declarationPaths, 'cjs'),
    );
  }));
}

await mkdir(distDirectory, { recursive: true });
await copyFile(new URL('../src/styles.css', import.meta.url), new URL('styles.css', distDirectory));
await prepareDeclarations(distDirectory);

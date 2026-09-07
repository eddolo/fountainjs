import { transformAsync } from '@babel/core';
import { createEs2015LinkerPlugin } from '@angular/compiler-cli/linker/babel';
import { ConsoleLogger, LogLevel, NodeJSFileSystem } from '@angular/compiler-cli';

// Link partial Angular library declarations for the demo consumer. The
// published library remains partial-Ivy, never tied to this app's full build.
export function angularLinker() {
  return {
    name: 'fountain-angular-linker', enforce: 'pre',
    async transform(code, id) {
      if (!/\.m?js(?:\?|$)/u.test(id) || !code.includes('ɵɵngDeclare')) return;
      const result = await transformAsync(code, {
        filename: id.split('?')[0], configFile: false, babelrc: false, sourceMaps: true,
        plugins: [createEs2015LinkerPlugin({
          jitMode: false, fileSystem: new NodeJSFileSystem(), logger: new ConsoleLogger(LogLevel.warn),
        })],
      });
      return result && { code: result.code, map: result.map };
    },
  };
}

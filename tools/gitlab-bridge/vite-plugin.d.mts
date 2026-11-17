export function gitlabVue2BridgePlugin(): {
  name: string;
  enforce: 'pre';
  resolveId(id: string): string | null;
  load(id: string): string | null;
  transform(source: string, id: string): { code: string; map: null } | null;
};

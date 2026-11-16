import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url), pin=JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json',root)));
const ruby=`require 'json'
predicate=/\\A[[:space:]]\\z/u
values=(0..0x10ffff).select { |n| next false if (0xd800..0xdfff).cover?(n); [n].pack('U').match?(predicate) }
puts JSON.generate({ruby:RUBY_VERSION,rule:predicate.source,codepoints:values})
`;
const result=JSON.parse(execFileSync('docker',['run','--rm','-i','--network=none','--cpus=1','--memory=128m','--read-only',
  '--entrypoint','/opt/gitlab/embedded/bin/ruby',pin.image],{input:ruby,encoding:'utf8',timeout:30000}));
await writeFile(new URL('artifacts/gitlab-suggestion-whitespace-oracle-20261116.json',root),JSON.stringify({image:pin.image,sourceRevision:pin.commit,
  scope:'Actual pinned embedded Ruby Unicode POSIX space predicate used by ActiveSupport String#blank?; source semantics, not a whole Rails test suite.',...result},null,2)+'\n');
console.log(JSON.stringify(result));

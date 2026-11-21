import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

// This profile is applied only to the disposable wiki upload fixture and only to its uploader tab.
export function enableUploadIngressReceipt(rootCompose, env, docker, overridePath) {
  const config = JSON.parse(docker(...rootCompose,'config','--format','json')).services.baseline.environment.GITLAB_OMNIBUS_CONFIG;
  if (typeof config !== 'string' || !config.includes('external_url')) throw new Error('Missing pinned GitLab configuration.');
  env.FOUNTAIN_GITLAB_INGRESS_CONFIG = config + "\nnginx['log_format'] = 'fountain-ingress $http_x_fountain_transfer_probe $status $request_length $content_length'\n";
  rootCompose.push('-f',overridePath);
}

export function readUploadIngress(docker, container, marker) {
  if (!/^[0-9a-f-]{36}$/u.test(marker)) throw new Error('Invalid local upload probe.');
  // Filter inside the container. Only numeric fields from the tagged POST leave the log.
  const parse = `File.open(ARGV[0]) do |f|
    f.seek([0,f.stat.size-262144].max)
    f.each_line do |line|
      tag,id,status,received,declared = line.split
      if tag == 'fountain-ingress' && id == ARGV[1] && [status,received,declared].all? { |s| s && s.match?(/\\A[0-9]+\\z/) }
        puts [status,received,declared].join(' ')
      end
    end
  end`;
  const row = docker('exec',container,'/opt/gitlab/embedded/bin/ruby','-e',parse,'/var/log/gitlab/nginx/gitlab_access.log',marker).trim();
  if (!row) return undefined;
  if (!/^\d+ \d+ \d+$/u.test(row)) throw new Error('Expected one GitLab ingress receipt for the interrupted POST.');
  const [status,requestBytes,declaredBodyBytes] = row.split(' ').map(Number);
  return {status,requestBytes,declaredBodyBytes};
}

export async function throttleWikiUpload(page, name, size) {
  const marker = randomUUID(), network = await page.context().newCDPSession(page);
  const normal = {offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1};
  await network.send('Network.enable');
  try {
    await network.send('Network.emulateNetworkConditions',{...normal,uploadThroughput:65536});
    await page.evaluate(({marker,name,size}) => {
      const send = XMLHttpRequest.prototype.send;
      const probe = window.__fountainWikiTransfer = {loaded:0,total:0,restore:() => { XMLHttpRequest.prototype.send = send; }};
      XMLHttpRequest.prototype.send = function(body) {
        const file = body instanceof FormData && body.get('file');
        if (file instanceof File && file.name === name && file.size === size) {
          probe.restore();
          this.setRequestHeader('X-Fountain-Transfer-Probe',marker);
          this.upload.addEventListener('progress',event => { probe.loaded = event.loaded; probe.total = event.total; });
          probe.abort = () => this.abort();
        }
        return send.call(this,body);
      };
    },{marker,name,size});
  } catch (error) { await network.detach(); throw error; }
  return {
    async interrupt(readReceipt,headerBound) {
      await expect.poll(() => page.evaluate(() => window.__fountainWikiTransfer.loaded),{timeout:30000}).toBeGreaterThan(192*1024);
      const browser = await page.evaluate(() => {
        const {loaded,total,abort} = window.__fountainWikiTransfer;
        if (!abort || loaded >= total) throw new Error('Upload already finished before the interruption.');
        abort();
        return {loaded,total};
      });
      await network.send('Network.emulateNetworkConditions',normal);
      let receipt;
      await expect.poll(() => Boolean(receipt = readReceipt(marker)),{timeout:15000}).toBe(true);
      // The ingress count includes HTTP headers and multipart framing. Subtract a
      // conservative header bound and the entire framing before attributing bytes to the file.
      const framing = receipt.declaredBodyBytes - size;
      expect(framing).toBeGreaterThan(0);
      expect(receipt.declaredBodyBytes).toBe(browser.total);
      expect(receipt.status).toBeGreaterThanOrEqual(400);
      const minimumFileBytes = receipt.requestBytes - headerBound - framing;
      expect(minimumFileBytes).toBeGreaterThan(0);
      expect(receipt.requestBytes).toBeLessThan(size);
      return {...receipt,browser,headerBound,minimumFileBytes,fileBytes:size};
    },
    async dispose() {
      try { await page.evaluate(() => { window.__fountainWikiTransfer?.restore(); delete window.__fountainWikiTransfer; }); }
      finally { await network.detach(); }
    },
  };
}

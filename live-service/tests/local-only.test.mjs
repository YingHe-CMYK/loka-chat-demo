import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../cloudflare/worker.mjs';
test('unconfigured auth stays blocked and cloud inference never receives a model result',async()=>{
 const config=await api(new Request('https://loka.test/api/config'),{},'/api/config');assert.equal((await config.json()).ready,false);
 const account=await api(new Request('https://loka.test/api/me'),{},'/api/me');assert.equal(account.status,503);
 const cloud=await api(new Request('https://loka.test/api/preview/model',{method:'POST',body:'private-data-must-not-be-processed'}),{},'/api/preview/model');assert.equal(cloud.status,410);assert.equal((await cloud.json()).error,'CLOUD_INFERENCE_DISABLED');
});

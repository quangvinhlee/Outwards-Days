// Synthetic local evaluation only: never use this recorder for real user traffic.
import { writeFile } from 'node:fs/promises';
const original=globalThis.fetch;
let n=0;
globalThis.fetch=async(input,init)=>{const response=await original(input,init);if(String(input).endsWith('/api/chat'))await writeFile(`/tmp/outsideweek-model-${++n}.json`,JSON.stringify({request:JSON.parse(String(init?.body)),status:response.status,body:await response.clone().json()},null,2));return response;};
await import('./live.js');

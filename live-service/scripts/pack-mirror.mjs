import {cp, mkdir, readdir} from 'node:fs/promises';
const dest=new URL('../dist/mirror/',import.meta.url);
const root=new URL('../../',import.meta.url);
await mkdir(dest,{recursive:true});
for (const name of await readdir(root)) {
  if(name.endsWith('.js') || name.endsWith('.css') || ['index.html','mirror-loop.html','wallet-preview-qr.svg','vendor'].includes(name)) await cp(new URL(name,root),new URL(name,dest),{recursive:true});
}

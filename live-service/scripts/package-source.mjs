import {execFileSync} from 'node:child_process';
import {mkdirSync,existsSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]||'../../../../output/loka-handoff');mkdirSync(output,{recursive:true});
const archive=resolve(output,'loka-frontend-source.zip');if(existsSync(archive))rmSync(archive);
const entries=['src','public','cloudflare','server','scripts','tests','docs','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','wrangler.jsonc','HANDOFF.md','PRIVY_SETUP.md','.env.example'].filter(p=>existsSync(p));
execFileSync('zip',['-qr',archive,...entries,'-x','*/.DS_Store','*/.env','*/.env.local','*/node_modules/*','*/.wrangler/*']);console.log(archive);

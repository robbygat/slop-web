import {readFile} from 'node:fs/promises';
const directory=new URL('../supabase/billing/',import.meta.url);
const patch=await readFile(new URL('patch-allowance.sql',directory),'utf8');
let sql=await readFile(new URL('restore-authority.sql',directory),'utf8');
sql=sql.replace('begin;\n',`begin;\n${patch}\n`);
if(process.argv.includes('--check'))sql=sql.replace(/commit;\s*$/,'rollback;\n');
process.stdout.write(sql);

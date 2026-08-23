import postgres from "postgres";
import fs from "node:fs";
const env = fs.readFileSync("C:/Users/pette/Projects/strale/.env","utf8");
const url = env.split(/\r?\n/).find(l=>l.startsWith("DATABASE_URL=")).slice(13).replace(/^["']|["']$/g,"");
const sql = postgres(url,{ssl:false,max:1});
const q = fs.readFileSync(process.argv[2],"utf8");
try{ const r = await sql.unsafe(q); console.log(JSON.stringify(r,null,1)); }
catch(e){ console.error("ERR",e.message); }
await sql.end();

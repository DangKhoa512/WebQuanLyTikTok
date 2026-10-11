const fs=require('fs'),path=require('path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const db=require('../src/config/database');require('../src/config/logger').silent=true;require('../src/models');
const observed=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../tests/database/schema-observed.json')));
const tableColumns=new Map();for(const c of observed.columns){if(!tableColumns.has(c.TABLE_NAME))tableColumns.set(c.TABLE_NAME,new Set());tableColumns.get(c.TABLE_NAME).add(c.COLUMN_NAME);}
const models=Object.values(db.models).map(model=>({model:model.name,table:model.getTableName(),columns:Object.keys(model.rawAttributes),missing_columns:Object.keys(model.rawAttributes).filter(c=>!tableColumns.get(model.getTableName())?.has(c)),indexes:model.options.indexes.map(i=>({name:i.name||null,unique:!!i.unique,fields:i.fields})),enum_columns:Object.fromEntries(Object.entries(model.rawAttributes).filter(([,a])=>a.type.values).map(([k,a])=>[k,a.type.values]))}));
const index=fs.readFileSync(path.resolve(__dirname,'../src/routes/index.js'),'utf8');
const mounts=new Map([...index.matchAll(/router\.use\('([^']+)'[^;\n]*require\('\.\/([^']+)'\)/g)].map(m=>[m[2],'/api'+m[1]]));
for(const key of ['totp','emailtick','mail'])mounts.set(key,'/api/'+key);
const endpoints=[];
for(const file of fs.readdirSync(path.resolve(__dirname,'../src/routes'))){if(file==='index.js')continue;const s=fs.readFileSync(path.resolve(__dirname,'../src/routes',file),'utf8');
for(const m of s.matchAll(/router\.(get|post|put|patch|delete|all)\('([^']+)',([^\n]+)/g))endpoints.push({method:m[1].toUpperCase(),path:(mounts.get(file.replace('.js',''))||'UNKNOWN')+m[2],source:'backend/src/routes/'+file,explicit_auth:m[3].includes('apiKeyAuth')?'apiKeyAuth':m[3].includes('jwtAuth')?'jwtAuth':'inherited-or-controller',handler:m[3].trim()});}
const scanDir=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scanDir(path.join(dir,e.name)):/\.(js|jsx)$/.test(e.name)?[path.join(dir,e.name)]:[]);
const sources=[...scanDir(path.resolve(__dirname,'../src')),...scanDir(path.resolve(__dirname,'../../frontend/src'))];
const signals=sources.map(p=>{const s=fs.readFileSync(p,'utf8');return {file:path.relative(path.resolve(__dirname,'../..'),p).replace(/\\/g,'/'),lines:s.split('\n').length,raw_queries:(s.match(/sequelize\.query|db\.query/g)||[]).length,owner_references:(s.match(/owner_username|ownerFrom|scopedWhere/g)||[]).length};});
fs.mkdirSync(path.resolve(__dirname,'../tests/audit'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../tests/audit/source-inventory.json'),JSON.stringify({observed_at:new Date().toISOString(),note:'Static inventory is not an assertion that every path is dynamically tested',models,endpoints,sources:signals},null,2));
console.log(JSON.stringify({models:models.length,observed_tables:tableColumns.size,endpoints:endpoints.length,source_files:sources.length,missing_model_columns:models.reduce((sum,m)=>sum+m.missing_columns.length,0)}));
db.close();

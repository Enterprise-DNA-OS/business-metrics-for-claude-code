#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {parseCsv} from './lib/csv.mjs';
import {table} from './lib/format.mjs';

export const help={
 help:'List commands. Flags use --name=value. All commands accept --json.',
 metrics:'Metric definitions, units, owners and review dates.',
 scorecard:'Latest monthly actual and target by metric and segment.',
 attention:'Off-target, stale, missing and overdue work.',
 trend:'trend <metric>: ordered monthly results, previous period and change.',
 variance:'Off-target latest results, with actual, target and variance.',
 sources:'Source coverage, import scope and source row counts.',
 'missing-targets':'Latest results without an agreed target.',
 actions:'All review actions with due date and status.',
 compliance:'Evidence and personal-information review checks.',
 metric:'metric <code|name|id-prefix>: definition, observations, targets and actions.',
 add:'add --code= --name= --unit= --kind=sum|ratio --direction=higher|lower --owner= --definition= --actor= [--personal=true --purpose= --review-on=YYYY-MM-DD]',
 log:'log <metric> --period=YYYY-MM-01 --segment= --value= --key= --evidence= --actor= [--denominator=]',
 target:'target <metric> --period=YYYY-MM-01 --segment= --value= --note= --actor=: set a target, preserving its old value in history.',
 review:'review <metric> --expected=N --next-review=YYYY-MM-DD --note= --actor= [--purpose= --owner= --definition=]',
 action:'action <metric> --code= --title= --owner= --due=YYYY-MM-DD --actor=',
 'close-action':'close-action <code|title|id-prefix> --resolution= --actor=',
 import:'import tableau --metric= --file= --source= --scope= --date-column= --segment-column= --value-column= --actor= [--key-column= --denominator-column= --dry-run]',
 export:'export --out=new.json: full private snapshot, including original import data.',
 history:'history <metric>: recorded changes and decisions.',
 'weekly-review':'Draft a review from attention, variance and actions.',
 'draft-variance':'draft-variance <metric>: draft an evidence request from actuals and actions.'
};
const flags={
 add:['code','name','unit','kind','direction','owner','definition','actor','personal','purpose','review-on'],
 log:['period','segment','value','key','evidence','actor','denominator'],target:['period','segment','value','note','actor'],
 review:['expected','next-review','note','actor','purpose','owner','definition'],action:['code','title','owner','due','actor'],
 'close-action':['resolution','actor'],import:['metric','file','source','scope','date-column','segment-column','value-column','actor','key-column','denominator-column','dry-run'],export:['out']
};
const selectors=new Set(['trend','metric','log','target','review','action','close-action','history','draft-variance','import']);
function parse(args){const pos=[],f={};for(const a of args){if(a.startsWith('--')){const i=a.indexOf('=');const k=a.slice(2,i<0?undefined:i);if(k in f)throw Error('Duplicate flag: '+k);if(['json','dry-run'].includes(k)&&i>=0)throw Error('Use --'+k+' without a value');f[k]=i<0?true:a.slice(i+1);}else pos.push(a);}const cmd=pos.shift()||'help';if(!help[cmd])throw Error('Unknown command: '+cmd);for(const k of Object.keys(f))if(k!=='json'&&!(flags[cmd]||[]).includes(k))throw Error('Unknown flag: '+k);if(pos.length>(selectors.has(cmd)?1:0))throw Error('Too many arguments');if(selectors.has(cmd)&&!pos.length)throw Error('Selector required');return{cmd,pos,f};}
function required(f,k){if(typeof f[k]!=='string'||!f[k].trim())throw Error('Required --'+k+'=value');return f[k].trim();}
function date(v,month=false){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Expected valid ISO date');if(month&&!v.endsWith('-01'))throw Error('Period must be the first day of a month');return v;}
function number(v){if(typeof v!=='string'||!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(v.trim())||!Number.isFinite(Number(v))||Math.abs(Number(v))>=1e15||((v.split('.')[1]||'').length>4))throw Error('Expected finite decimal with at most four places; no currency or separators');return v.trim();}
function boolean(v){if(v===undefined)return false;if(!['true','false'].includes(v))throw Error('Expected true or false');return v==='true';}
function decimalKey(v){const s=String(v);const sign=s.startsWith('-')?-1n:1n;const [whole,fraction='']=s.replace(/^[-+]/,'').split('.');return sign*BigInt((whole||'0')+fraction.padEnd(4,'0'));}
function sameDecimal(a,b){return a===null||b===null?a===b:decimalKey(a)===decimalKey(b);}
async function select(db,t,s){if(!s)throw Error('Selector required');const names=t==='metrics'?'name':'title';const exact=await db.query(`SELECT * FROM ${t} WHERE lower(code)=lower($1)`,[s]);if(exact.length)return exact[0];const rows=await db.query(`SELECT * FROM ${t} WHERE starts_with(id::text,lower($1)) OR lower(${names})=lower($1) ORDER BY code`,[s]);if(rows.length!==1){const e=Error(rows.length?'Ambiguous selector':'Record not found');e.candidates=rows.map(r=>({id:r.id,code:r.code,name:r[names]}));throw e;}return rows[0];}
async function event(db,id,actor,event,detail){await db.query('INSERT INTO events(metric_id,actor,event,detail) VALUES($1,$2,$3,$4)',[id,actor,event,JSON.stringify(detail)]);}
async function transaction(db,fn,dry=false){await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');try{const result=await fn();await db.exec(dry?'ROLLBACK':'COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}
const reportSql={
 metrics:'SELECT code,name,unit,kind,direction,owner,review_on,version FROM metrics ORDER BY code',
 scorecard:'SELECT code,name,period,segment,unit,actual,target,variance,status FROM v_latest ORDER BY code,segment',
 attention:'SELECT * FROM v_attention ORDER BY code,reason,segment',
 variance:"SELECT code,segment,period,unit,actual,target,variance,variance_percent,owner FROM v_latest WHERE status='off target' ORDER BY code,segment",
 'missing-targets':"SELECT code,segment,period,unit,actual FROM v_latest WHERE status='missing target' ORDER BY code,segment",
 actions:'SELECT a.code,m.code metric,a.title,a.owner,a.due_on,a.status,a.resolution FROM actions a JOIN metrics m ON m.id=a.metric_id ORDER BY a.due_on,a.code',
 compliance:'SELECT * FROM v_compliance ORDER BY code,rule',
 sources:"SELECT o.source,m.code,count(*) rows,min(o.period) first_period,max(o.period) last_period,string_agg(DISTINCT COALESCE(i.scope,'Manual or synthetic data'),'; ') scope FROM observations o JOIN metrics m ON m.id=o.metric_id LEFT JOIN imports i ON i.id=o.import_id GROUP BY o.source,m.code ORDER BY o.source,m.code"
};
export function display(x){if(Array.isArray(x)){if(!x.length)return '(none)';return table(x,Object.keys(x[0]).map(key=>({key,label:key.replaceAll('_',' '),format:v=>v instanceof Date?v.toISOString().slice(0,10):typeof v==='object'&&v!==null?JSON.stringify(v):v})));}return JSON.stringify(x,null,2);}
function privateWrite(file,text){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,text,{flag:'wx',mode:0o600});return file;}
function draft(title,sections){const file=path.resolve(process.env.DRAFT_DIR||path.join(REPO_ROOT,'drafts'),new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'.md');privateWrite(file,'# '+title+'\n\nDraft for review. Nothing sent. Synthetic data only when using the demo.\n\n'+sections.map(([name,rows])=>'## '+name+'\n\n```text\n'+display(rows)+'\n```').join('\n\n')+'\n');return{draft:file,sent:false};}

export async function run(db,args){
 const {cmd,pos,f}=parse(args);if(cmd==='help')return Object.entries(help).map(([command,usage])=>({command,usage}));
 if(reportSql[cmd])return db.query(reportSql[cmd]);
 if(cmd==='export'){return transaction(db,async()=>{const out={format:'business-metrics-v1',exported_at:new Date().toISOString()};for(const t of ['metrics','observations','targets','actions','events','imports'])out[t]=await db.query('SELECT * FROM '+t+' ORDER BY id');const file=path.resolve(required(f,'out'));privateWrite(file,JSON.stringify(out,null,2)+'\n');return{file,metrics:out.metrics.length,observations:out.observations.length};});}
 if(cmd==='weekly-review')return draft('Weekly metric review',await Promise.all(['attention','variance','actions'].map(async k=>[k,await db.query(reportSql[k])])));
 if(cmd==='add')return transaction(db,async()=>{const personal=boolean(f.personal);const row=(await db.query('INSERT INTO metrics(code,name,unit,kind,direction,owner,definition,personal,purpose,review_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[required(f,'code'),required(f,'name'),required(f,'unit'),required(f,'kind'),required(f,'direction'),required(f,'owner'),required(f,'definition'),personal,f.purpose||'',f['review-on']?date(f['review-on']):null]))[0];await event(db,row.id,required(f,'actor'),'metric added',{code:row.code});return row;});
 if(cmd==='import'){
  if(pos[0]!=='tableau')throw Error('Supported import: tableau');
  const metric=await select(db,'metrics',required(f,'metric'));const actor=required(f,'actor'),source=required(f,'source'),scope=required(f,'scope');
  const bytes=fs.readFileSync(required(f,'file'));if(bytes.length>20*1024*1024)throw Error('CSV exceeds 20 MiB');
  if(bytes.includes(0))throw Error('Convert the export to UTF-8 CSV first');
  const csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const rows=parseCsv(csv);if(!rows.length)throw Error('CSV has no records');
  const mapping=Object.fromEntries(['date-column','segment-column','value-column','key-column','denominator-column'].filter(k=>f[k]!==undefined).map(k=>[k,required(f,k)]));
  for(const k of ['date-column','segment-column','value-column'])required(f,k);
  for(const col of Object.values(mapping))if(!Object.hasOwn(rows[0],col))throw Error('CSV column missing: '+col);
  if(metric.kind==='ratio'&&!mapping['denominator-column'])throw Error('Ratio import needs --denominator-column');
  if(metric.kind==='sum'&&mapping['denominator-column'])throw Error('Sum has no denominator');
  const fingerprint=createHash('sha256').update(JSON.stringify({metric:metric.id,source,scope,mapping,csv})).digest('hex');
  return transaction(db,async()=>{
   await db.query('SELECT id FROM metrics WHERE id=$1 FOR UPDATE',[metric.id]);
   if((await db.query('SELECT id FROM imports WHERE fingerprint=$1',[fingerprint])).length)return{duplicate:true,imported:0,dry_run:!!f['dry-run']};
   const imp=(await db.query('INSERT INTO imports(fingerprint,source,scope,csv_text,mapping,actor) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[fingerprint,source,scope,csv,JSON.stringify(mapping),actor]))[0];
   let added=0,unchanged=0;const keys=new Set();
   for(const r of rows){
    const period=date(r[mapping['date-column']].trim(),true),segment=r[mapping['segment-column']].trim();if(!segment)throw Error('Empty segment');
    const value=number(r[mapping['value-column']]),denominator=mapping['denominator-column']?number(r[mapping['denominator-column']]):null;
    const key=mapping['key-column']?r[mapping['key-column']].trim():JSON.stringify([period,segment]);if(!key||keys.has(key))throw Error('Duplicate or empty source row key: '+key);keys.add(key);
    const existing=(await db.query('SELECT * FROM observations WHERE metric_id=$1 AND source=$2 AND row_key=$3',[metric.id,source,key]))[0];
    if(existing){
     // Compare exact decimal values and unordered JSONB keys. No floating-point rounding.
     const sameRaw=Object.keys(r).length===Object.keys(existing.raw).length&&Object.entries(r).every(([k,v])=>existing.raw[k]===v);
     const sameFacts=existing.period===period&&existing.segment===segment&&sameDecimal(existing.numerator,value)&&sameDecimal(existing.denominator,denominator);
     if(!sameRaw||!sameFacts)throw Error('Source row already exists with changed data: '+key);
     unchanged++;continue;
    }
    await db.query('INSERT INTO observations(metric_id,period,segment,numerator,denominator,source,row_key,evidence,raw,import_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[metric.id,period,segment,value,denominator,source,key,scope,JSON.stringify(r),imp.id]);added++;
   }
   await event(db,metric.id,actor,'CSV imported',{import_id:imp.id,source,scope,added,unchanged});return{imported:added,unchanged,dry_run:!!f['dry-run'],source};
  },!!f['dry-run']);
 }
 if(cmd==='close-action')return transaction(db,async()=>{const a=await select(db,'actions',pos[0]);const rows=await db.query("UPDATE actions SET status='closed',resolution=$2,closed_at=now() WHERE id=$1 AND status='open' RETURNING *",[a.id,required(f,'resolution')]);if(!rows.length)throw Error('Action already closed');await event(db,a.metric_id,required(f,'actor'),'action closed',{code:a.code,resolution:f.resolution});return rows[0];});
 const m=await select(db,'metrics',pos[0]);
 if(cmd==='trend')return db.query('SELECT code,period,segment,unit,actual,target,previous_period,previous_actual,change FROM v_trends WHERE metric_id=$1 ORDER BY segment,period',[m.id]);
 if(cmd==='history')return db.query('SELECT actor,event,detail,created_at FROM events WHERE metric_id=$1 ORDER BY created_at,id',[m.id]);
 if(cmd==='metric')return{metric:m,observations:await db.query('SELECT * FROM observations WHERE metric_id=$1 ORDER BY period,segment,id',[m.id]),targets:await db.query('SELECT * FROM targets WHERE metric_id=$1 ORDER BY period,segment',[m.id]),actions:await db.query('SELECT * FROM actions WHERE metric_id=$1 ORDER BY due_on',[m.id])};
 if(cmd==='draft-variance')return draft('Review '+m.name,[['Monthly results',await db.query('SELECT code,period,segment,unit,actual,target,variance,status FROM v_scorecard WHERE metric_id=$1 ORDER BY period,segment',[m.id])],['Actions',await db.query('SELECT code,title,owner,due_on,status FROM actions WHERE metric_id=$1 ORDER BY due_on',[m.id])],['Request',[{note:'Confirm the source coverage, explain the variance and assign the next action. Do not infer causes from the numbers alone.'}]]]);
 return transaction(db,async()=>{
  await db.query('SELECT id FROM metrics WHERE id=$1 FOR UPDATE',[m.id]);const actor=required(f,'actor');
  if(cmd==='log'){
   const row=(await db.query('INSERT INTO observations(metric_id,period,segment,numerator,denominator,source,row_key,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[m.id,date(required(f,'period'),true),required(f,'segment'),number(required(f,'value')),f.denominator!==undefined?number(f.denominator):null,'manual',required(f,'key'),required(f,'evidence')]))[0];await event(db,m.id,actor,'actual logged',{id:row.id,key:f.key});return row;
  }
  if(cmd==='target'){
   const period=date(required(f,'period'),true),segment=required(f,'segment'),value=number(required(f,'value')),note=required(f,'note');const before=await db.query('SELECT * FROM targets WHERE metric_id=$1 AND period=$2 AND segment=$3',[m.id,period,segment]);
   const row=(await db.query('INSERT INTO targets(metric_id,period,segment,value,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT(metric_id,period,segment) DO UPDATE SET value=excluded.value,note=excluded.note RETURNING *',[m.id,period,segment,value,note]))[0];await event(db,m.id,actor,'target agreed',{before:before[0]||null,after:row});return row;
  }
  if(cmd==='review'){
   const next=date(required(f,'next-review'));if(next<=new Date().toISOString().slice(0,10))throw Error('Next review must be in the future');const expected=required(f,'expected');if(!/^[1-9]\d*$/.test(expected))throw Error('Expected version must be a positive integer');
   const current=(await db.query('SELECT * FROM metrics WHERE id=$1',[m.id]))[0];const row=(await db.query('UPDATE metrics SET review_on=$2,reviewed_at=now(),purpose=$3,owner=$4,definition=$5,version=version+1 WHERE id=$1 AND version=$6 RETURNING *',[m.id,next,f.purpose??current.purpose,f.owner??current.owner,f.definition??current.definition,expected]))[0];if(!row)throw Error('Metric version changed; read it again');await event(db,m.id,actor,'definition reviewed',{note:required(f,'note'),before:current,after:row});return row;
  }
  if(cmd==='action'){const row=(await db.query('INSERT INTO actions(code,metric_id,title,owner,due_on) VALUES($1,$2,$3,$4,$5) RETURNING *',[required(f,'code'),m.id,required(f,'title'),required(f,'owner'),date(required(f,'due'))]))[0];await event(db,m.id,actor,'action assigned',{code:row.code,title:row.title,owner:row.owner,due_on:row.due_on});return row;}
  throw Error('Unhandled command: '+cmd);
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){let db;try{db=await getDb();const result=await run(db,process.argv.slice(2));console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):display(result));}catch(e){console.error(process.argv.includes('--json')?JSON.stringify({error:e.message,...(e.candidates?{candidates:e.candidates}:{})}):e.message+(e.candidates?'\n'+display(e.candidates):''));process.exitCode=1;}finally{await db?.close();}}

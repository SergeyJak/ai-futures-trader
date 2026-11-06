import type pg from 'pg';
import type {JobRecord,JobLease,JobStore} from './relative-strength-job.js';
const LOCK=72061106;
export class RelativeStrengthStore implements JobStore{
 private ready:Promise<void>|null=null;
 constructor(private pool:pg.Pool){}
 async init(){if(!this.ready)this.ready=this.initialize().catch(e=>{this.ready=null;throw e});return this.ready}
 private async initialize(){await this.pool.query(`CREATE TABLE IF NOT EXISTS relative_strength_forward (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id),packet JSONB,checkpoint JSONB,status JSONB,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await this.pool.query('INSERT INTO relative_strength_forward(id) VALUES(TRUE) ON CONFLICT DO NOTHING');}
 async read():Promise<JobRecord>{await this.init();return (await this.pool.query('SELECT packet,checkpoint,status FROM relative_strength_forward WHERE id=TRUE')).rows[0]}
 async withLock(fn:(lease:JobLease,signal:AbortSignal)=>Promise<void>){
  await this.init();const client=await this.pool.connect(),controller=new AbortController();let locked=false,broken=false;
  const onError=()=>{broken=true;controller.abort(Error('Database lease lost'))};client.on('error',onError);
  try{locked=(await client.query('SELECT pg_try_advisory_lock($1) AS locked',[LOCK])).rows[0].locked;if(!locked)return false;
   await fn({read:async()=> (await client.query('SELECT packet,checkpoint,status FROM relative_strength_forward WHERE id=TRUE')).rows[0],save:async(row)=>{controller.signal.throwIfAborted();await client.query('UPDATE relative_strength_forward SET packet=$1::jsonb,checkpoint=$2::jsonb,status=$3::jsonb,updated_at=NOW() WHERE id=TRUE',[JSON.stringify(row.packet),JSON.stringify(row.checkpoint),JSON.stringify(row.status)])}},controller.signal);return true;
  }finally{if(locked&&!broken){try{await client.query('SELECT pg_advisory_unlock($1)',[LOCK])}catch{broken=true}}client.removeListener('error',onError);client.release(broken)}
 }
}

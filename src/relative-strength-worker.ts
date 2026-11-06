import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {WorkerResult} from './relative-strength-job.js';
const exec=promisify(execFile);
export async function runRelativeStrengthWorker(packet:unknown,end:number,signal:AbortSignal):Promise<WorkerResult>{
 const folder=await mkdtemp(join(tmpdir(),'relative-strength-'));
 try{
  const input=join(folder,'input.json'),output=join(folder,'output.json');
  await writeFile(input,JSON.stringify(packet??null),{mode:0o600});
  try{await exec('python3',['research/relative-strength-forward/worker.py','--input',input,'--output',output,'--end',String(end)],{signal,timeout:180000,killSignal:'SIGKILL',maxBuffer:64*1024})}
  catch(e){const error=e as NodeJS.ErrnoException&{stderr?:string;killed?:boolean};if(signal.aborted)throw Error('Worker stopped');if(error.code==='ENOENT')throw Error('Python runtime unavailable');if(error.killed)throw Error('Worker timeout');throw Error(error.stderr?.trim().slice(-400)||'Worker failed')}
  if((await stat(output)).size>32*1024*1024)throw Error('Worker output too large');
  return JSON.parse(await readFile(output,'utf8'));
 }finally{await rm(folder,{recursive:true,force:true})}
}

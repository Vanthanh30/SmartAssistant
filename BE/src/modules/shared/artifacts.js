import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export function artifactStore(config){
 if(!/^[a-zA-Z0-9_]+$/.test(config.DB_NAME))throw Error('INVALID_ARTIFACT_SCOPE');
 const scope=config.ARTIFACT_NAMESPACE||config.DB_NAME;if(!/^[a-zA-Z0-9_-]+$/.test(scope))throw Error('INVALID_ARTIFACT_SCOPE');
 const root=resolve(import.meta.dirname,'../../../storage/erd16',scope);
 const path=(kind,id)=>{if(!['documents','indexes','requests'].includes(kind)||!/^[a-zA-Z0-9_-]+$/.test(String(id)))throw Error('INVALID_ARTIFACT_ID');return resolve(root,kind,String(id)+'.json');};
 return {async read(kind,id){try{return JSON.parse(await readFile(path(kind,id),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},async write(kind,id,value){const destination=path(kind,id);await mkdir(dirname(destination),{recursive:true});const temporary=destination+'.'+randomUUID();await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temporary,destination);}};
}

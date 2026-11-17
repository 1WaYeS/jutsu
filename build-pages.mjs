import {mkdir,readFile,writeFile,readdir,stat,copyFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
const base=process.env.JUTSU_BASE_PATH||'/jutsu/';
if(!/^\/[A-Za-z0-9_.-]+\/$/.test(base))throw Error('JUTSU_BASE_PATH must be a single GitHub project path, for example /jutsu/.');
const routes=new Set(['translate','dictionary','history','train','classic','experimental','manual','qualification']);
const assets=new Set((await readdir('dist')).filter(name=>/\.(js|css|png|jpg)$/.test(name)));
const owned=new Set(['mobile-app.js','train-app.js','manual-app.js','ai-app.js','app.js','personal-worker.js']);
export function rewrite(text,file){
 // Rewrite only known application paths; leave third-party runtime filesystem paths alone.
 return text.replace(/(["'`])\/(?!\/)([^"'`\s<>]*)\1/g,(whole,quote,path)=>{
   const [name]=path.split(/[/?#]/);
   const isHome=path===''||path.startsWith('#');
   if(isHome&&!owned.has(file)&&extname(file)!=='.html')return whole;
   if(!isHome&&!routes.has(name)&&!assets.has(name)&&name!=='ai'&&name!=='api')return whole;
   let suffix=path;
   if(routes.has(name)){suffix=path.replace(/^([^/?#]+)(?=[?#]|$)/,'$1/');}
   return quote+base+suffix+quote;
 });
}
async function walk(dir){for(const name of await readdir(dir)){const path=join(dir,name);if((await stat(path)).isDirectory())await walk(path);else if(['.html','.js','.css','.mjs'].includes(extname(name))){await writeFile(path,rewrite(await readFile(path,'utf8'),name));}}}
// Build-mobile emits extensionless aliases; Pages needs real route directories.
const {cp}=await import('node:fs/promises');
const out='pages-dist';await mkdir(out,{recursive:true});
for(const name of await readdir('dist'))if(!routes.has(name))await cp(join('dist',name),join(out,name),{recursive:true});
await walk(out);
for(const route of routes){await mkdir(join(out,route),{recursive:true});const source=route==='train'?'train.html':route==='classic'?'classic.html':route==='experimental'?'experimental.html':route==='manual'?'manual.html':'index.html';if(route==='qualification'){const text=await readFile('MODEL_QUALIFICATION.md','utf8');await writeFile(join(out,route,'index.html'),'<html lang="en"><meta charset="utf-8"><title>JUTSU model qualification</title><pre>'+text.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</pre></html>');continue;}await copyFile(join(out,source),join(out,route,'index.html'));}
await writeFile(join(out,'.nojekyll'),'');
await writeFile(join(out,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>JUTSU — Page not found</title><body><h1>Page not found</h1><p><a href="'+base+'">Return to JUTSU</a></p></body></html>');
console.log(`Prepared GitHub Pages site at ${base}`);

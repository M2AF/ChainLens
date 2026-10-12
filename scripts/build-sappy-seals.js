const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const wallet=path.resolve(__dirname,'../../Magic Money Wallet');
const assets=path.join(wallet,'src/renderer/assets/themes/sappy-seals'),dest=path.resolve(__dirname,'../public/themes/sappy-seals');
fs.mkdirSync(dest,{recursive:true});fs.cpSync(assets,dest,{recursive:true});
fs.copyFileSync(path.join(wallet,'resources/themes/sappy-seals/PIXI-LICENSE.txt'),path.join(dest,'PIXI-LICENSE.txt'));
let source=fs.readFileSync(path.join(wallet,'src/renderer/components/SappySeal.tsx'),'utf8');
source=source.replace(/^\/\/\/.*\n/,'').replace(/import \{useEffect,useRef,useState\} from 'react'/, 'const React=window.React;const {useEffect,useRef,useState}=React;');
source=source.replace(/import (\w+) from '\.\.\/assets\/themes\/sappy-seals\/([^']+)'/g,(_,name,file)=>`const ${name}=${JSON.stringify('/themes/sappy-seals/'+file.replace(/\?url$/,''))};`);
source=source.replace(/^import \{alternateSeal.*$/m,'');
const motions=Object.fromEntries(fs.readdirSync(path.join(assets,'Motions')).filter(file=>file.endsWith('.json')).map(file=>['Motions/'+file,'/themes/sappy-seals/Motions/'+encodeURIComponent(file)]));
source=source.replace(/^const motions=.*$/m,`const motions=${JSON.stringify(motions)};`);
source=fs.readFileSync(path.join(wallet,'src/renderer/lib/seal-appearance.ts'),'utf8').replaceAll('mm.sappy-seal.alternate.v1','cl_sappy_seal_alternate.v1').replaceAll('mm-sappy-seal-appearance','cl-sappy-seal-appearance')+'\n'+source;
// ChainLens sidebar uses exactly twice the wallet's approved model/canvas fit.
source=source.replace('width:220,height:160','width:440,height:320').replace('model.position.set(w/2,h+28)','model.position.set(w/2,h+56)');
// A translated mobile drawer touches the viewport edge at zero visible area.
source=source.replace("new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;sync()})","new IntersectionObserver(entries=>{visible=(entries[0]?.intersectionRatio??0)>0;sync()},{threshold:[0,0.01]})");
if(source.includes('import.meta'))throw new Error('Unsupported wallet asset wiring');
source=source.replace("}catch{if(!disposed)element.dataset.ready='fallback'}","}catch(error){if(!disposed){element.dataset.ready='fallback';console.warn('Sappy seal unavailable',error)}}");
source=source.replaceAll("dataset.theme==='sappy-seals-art'","dataset.clArtTheme==='sappy-seals-art'").replaceAll("['data-theme','data-derived']","['data-cl-art-theme','data-derived']");
esbuild.buildSync({stdin:{contents:source,loader:'tsx',sourcefile:'shared-wallet-sappy-seal.tsx'},bundle:true,format:'iife',globalName:'ChainLensSappy',outfile:path.join(dest,'seal.js'),target:'es2020'});
esbuild.buildSync({entryPoints:[path.join(wallet,'src/shared/collection-theme-access.ts')],bundle:true,format:'iife',globalName:'ChainLensCollectionAccess',outfile:path.resolve(__dirname,'../public/collection-theme-core.js'),target:'es2020'});

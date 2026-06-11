import { writeFileSync } from 'node:fs';
import https from 'node:https';
const BASE='https://www.ambiente.gub.uy/geoserver/wfs';
const LAYER='u19600217:c257';
const PAGE=1000;
function getJson(startIndex){
  const url=`${BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${LAYER}&outputFormat=application/json&srsName=EPSG:4326&count=${PAGE}&startIndex=${startIndex}`;
  return new Promise((res,rej)=>{
    https.get(url,{timeout:120000},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(e){rej(new Error('parse @'+startIndex+': '+e.message+' | '+d.slice(0,200)));}});}).on('error',rej).on('timeout',function(){this.destroy();rej(new Error('timeout @'+startIndex));});
  });
}
const all=[];
let i=0;
while(true){
  const j=await getJson(i);
  const n=j.features?.length||0;
  all.push(...(j.features||[]));
  console.log(`startIndex ${i}: +${n} (total ${all.length})`);
  if(n<PAGE) break;
  i+=PAGE;
}
writeFileSync('.uy_tmp/cursos.geojson', JSON.stringify({type:'FeatureCollection',features:all}));
console.log('OK -> .uy_tmp/cursos.geojson |', all.length, 'feições');

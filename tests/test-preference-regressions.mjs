import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('history images and files never become composer attachments, including retry',async()=>{
 const {handle}=await import('../host/handle.js');const {resolveConfig}=await import('../host/config.js');
 for(const retry of [false,true]){
 const calls=[];const historical={type:'image',url:'https://example.invalid/history.png'};
 const scope={get:name=>name==='agentDefaultModel'?{currentSelection:()=>({provider:'p',model:'m'})}:undefined,
 sessions:{get:()=>({deriveMessages:()=>[{role:'user',content:[{type:'text',text:'project interface screenshot'},historical,{type:'file',name:'history.txt',textPreview:'historical file excerpt'}]}]})},
 llm:{listProviders:()=>[{id:'p'}],resolveModelInfo:async()=>({context:{contextWindow:128000}}),prepareCall:async()=>({config:{},stream:call=>{calls.push(call);return {async *[Symbol.asyncIterator](){yield {type:'text-delta',text:retry&&calls.length===1?'CLARIFY\nWhat should I do?':'ENHANCED\nImprove the project interface carefully'};yield {type:'finish',reason:{kind:'stop'}};}}}})}};
 const config=resolveConfig({contextEnabled:true,contextImages:true,contextImageCount:2,contextFileContents:true,contextFileCount:2});
 const out=await (await handle(scope,config,new Request('http://x/api/prompt-pilot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'s',draft:'Improve project interface'})}),null,new Map())).json();
 assert.equal(out.ok,true);assert.equal(calls.length,retry?2:1);
 for(const call of calls){const parts=call.messages[0].content;const texts=parts.filter(p=>p.type==='text').map(p=>p.text).join('\n');
 assert.match(texts,/COMPOSER IMAGES: 0/);assert.match(texts,/HISTORY IMAGES:/);assert.match(texts,/HISTORY FILE NAMES:/);assert.ok(!texts.includes('These composer images are part of the draft'));
 assert.equal(parts.filter(p=>p.type==='image').length,1);assert.equal(out.imagesUsed,0);assert.equal(out.contextImagesUsed,1);}
 }
});
test('mixed images retain distinct source sections',async()=>{
 const {buildUserContent}=await import('../host/llm.js');const old={type:'image',id:'old'},current={type:'image',id:'current'};
 const parts=buildUserContent('Improve task',{hasContext:true,turns:[],contextImages:[old]},[current]);
 assert.equal(parts.indexOf(current),parts.findIndex(p=>p.text?.startsWith('COMPOSER IMAGES:'))+1);
 assert.equal(parts.indexOf(old),parts.findIndex(p=>p.text?.startsWith('HISTORY IMAGES:'))+1);
});
const s=await readFile(new URL('../client.js',import.meta.url),'utf8');
const a=s.indexOf('const bytesToBase64'),b=s.indexOf('const taskStore',a);
const {readComposerFiles}=vm.runInNewContext(s.slice(a,b)+';({readComposerFiles})',{TextDecoder,Uint8Array,btoa});
test('file count zero reads no bytes but retains all names',async()=>{let reads=0;const owner={resolveDraftAttachments:async()=>['a','b'].map(name=>({kind:'file',file:{name:name+'.txt',size:1,arrayBuffer:async()=>{reads++;return new Uint8Array([65]).buffer}}}))};const result=await readComposerFiles(owner,null,['a','b'],{values:{composerFiles:true,composerFileCount:0}});assert.equal(reads,0);assert.equal(result.files.length,0);assert.equal(result.names.length,2);});
test('saved legacy context switch agrees with subsequent enhancement request',async()=>{
const {handle}=await import('../host/handle.js');const {handleSettings}=await import('../host/settings.js');const {resolveConfig}=await import('../host/config.js');const options={id:'dsh-prompt-pilot',config:{}};const calls=[];const boot=resolveConfig({});
const scope={fiber:{entry:{options}},get:name=>name==='settings'?{update:async(_,patch)=>Object.assign(options.config,patch)}:name==='agentDefaultModel'?{currentSelection:()=>({provider:'p',model:'m'})}:undefined,sessions:{get:()=>({deriveMessages:()=>[{role:'user',content:'UNIQUE_CONTEXT_SENTINEL'}]})},llm:{listProviders:()=>[{id:'p'}],resolveModelInfo:async()=>({context:{contextWindow:128000}}),prepareCall:async()=>({config:{},stream:call=>{calls.push(call);return {async *[Symbol.asyncIterator](){yield {type:'text-delta',text:'ENHANCED\nProduce a clear actionable request'};yield {type:'finish',kind:'stop'};}}}})}};
for(const patch of [{referenceContext:false},{referenceContext:true},{contextEnabled:false,referenceContext:true}]){await handleSettings(scope,boot,new Request('http://x/api/prompt-pilot/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)}));const values=(await (await handleSettings(scope,boot,new Request('http://x/api/prompt-pilot/settings'))).json()).values;const out=await (await handle(scope,boot,new Request('http://x/api/prompt-pilot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:'s',draft:'improve request'})}),null,new Map())).json();assert.equal(out.ok,true);assert.equal(JSON.stringify(calls.at(-1)).includes('UNIQUE_CONTEXT_SENTINEL'),values.contextEnabled);}
});


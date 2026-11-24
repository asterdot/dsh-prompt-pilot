import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(process.env.PILOT_CLIENT_SOURCE ? new URL(process.env.PILOT_CLIENT_SOURCE) : new URL('../client.js', import.meta.url),'utf8');
const readerStart=source.indexOf('const bytesToBase64'), readerEnd=source.indexOf('const taskStore',readerStart);
const composerReader=vm.runInNewContext(source.slice(readerStart,readerEnd)+';({readComposerFiles})',{TextDecoder,Uint8Array,btoa});
const defaults = {ruleSet:'legacy',useCustomModel:false,enhanceProvider:'',enhanceModel:'',referenceContext:true,referenceImages:false,referenceFiles:false,contextEnabled:true,contextImages:false,contextFileContents:false,composerImages:false,composerFiles:false,contextImageCount:2,contextFileCount:2,composerImageCount:2,composerFileCount:2,shortcutEnabled:true};
const ok = values => ({ok:true,json:async()=>({ok:true,values})});
const denied = {ok:false,status:503,json:async()=>({ok:false,message:'offline'})};
const settle = () => new Promise(resolve=>setImmediate(resolve));

// Render the registered component, exercising its real effects and event handlers
// without a desktop profile, network, React installation or live keyboard bridge.
function panel(replies, catalog=[]) {
  let cursor, plugin, Section, dictionary;const hooks={};
  const slots=[], effects=[], calls=[];
  const React={
    createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useCallback(fn){return fn;},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){const next=slots[i]={deps};effects.push(()=>{old?.cleanup?.();next.cleanup=fn()})}}
  };
  vm.runInNewContext(source,{window:{__promptPilotTestHooks:hooks,__ModuleLoader__:{load:d=>{plugin=d.factory(()=>React)}}},AbortController,setInterval:()=>1,clearInterval(){},fetch:async(url,opt)=>{assert.equal(url,'/api/prompt-pilot/settings');calls.push(opt);assert.ok(replies.length);return replies.shift()}});
  plugin.apply({effect:fn=>{if(fn.name!=='installStyles')fn()},inject(){},get(){},remote:{session:{modelCatalog:async()=>({ok:true,value:{groups:catalog}})}},locale:{register:(_,d)=>{dictionary=d.en},bind:()=>key=>dictionary[key]},slots:{inject:(_,fn)=>fn(),register:(d,c)=>{if(d.name==='settings.section')Section=c}}});
  function render(){cursor=0;const wrapper=Section({});const tree=wrapper.type(wrapper.props);effects.splice(0).forEach(fn=>fn());return tree;}
  function nodes(tree){return typeof tree==='object'&&tree!==null?[tree,...tree.children.flatMap(nodes)]:[];}
  return {render,calls,hooks,find:(tree,tag,text)=>nodes(tree).find(n=>n.type===tag&&(!text||n.children.includes(text))),nodes};
}

test('feedback remains a native keyboard-focusable link during loading and after GET failure; retry restores controls',async()=>{
  const p=panel([denied,ok(defaults)]);let view=p.render();
  for(let state=0;state!==2;state++){
    const a=p.find(view,'a','Report an issue');assert.equal(a.props.href,'https://github.com/asterdot/dsh-prompt-pilot/issues');assert.equal(a.props.target,'_blank');assert.match(a.props.rel,/noopener/);assert.equal(a.props.tabIndex,undefined);assert.equal(a.props.onKeyDown,undefined);
    await settle();view=p.render();
  }
  const retry=p.find(view,'button','Retry');assert.equal(retry.props.type,'button');retry.props.onClick();p.render();await settle();view=p.render();assert.ok(p.find(view,'select'));assert.equal(p.calls.length,2);
});

test('refused save keeps prior values and retry sends the same patch',async()=>{
  const p=panel([ok(defaults),denied,ok({...defaults,composerImages:true})]);p.render();await settle();let view=p.render();
  const imageBox=v=>p.nodes(v).find(n=>n.type==='label'&&n.props.key==='composerImages').children[0];
  assert.equal(imageBox(view).props.type,'checkbox');assert.equal(imageBox(view).props.checked,false);
  await imageBox(view).props.onChange({target:{checked:true}});view=p.render();assert.equal(imageBox(view).props.checked,false);assert.ok(p.nodes(view).find(n=>n.props.role==='alert'));
  await p.find(view,'button','Retry').props.onClick();view=p.render();assert.equal(imageBox(view).props.checked,true);assert.ok(!p.nodes(view).some(n=>n.props.role==='alert'));assert.equal(p.calls[1].body,p.calls[2].body);assert.deepEqual(JSON.parse(p.calls[2].body),{composerImages:true});
});

test('source settings hide inactive counts and expose modern API keys',async()=>{
 const p=panel([ok(defaults)]);p.render();await settle();const view=p.render();
 assert.equal(p.nodes(view).filter(n=>n.type==='fieldset').length,6);
 const numbers=p.nodes(view).filter(n=>n.type==='input'&&n.props.type==='number');assert.equal(numbers.length,0);
 const toggle=key=>p.nodes(view).find(n=>n.type==='label'&&n.props.key===key).children[0];
 await toggle('contextImages').props.onChange({target:{checked:true}});await toggle('contextFileContents').props.onChange({target:{checked:true}});
 assert.deepEqual(JSON.parse(p.calls[1].body),{contextImages:true});assert.deepEqual(JSON.parse(p.calls[2].body),{contextFileContents:true});
});

test('all enabled media counts appear and turning context off hides its children',async()=>{
 const enabled={...defaults,contextImages:true,contextFileContents:true,composerImages:true,composerFiles:true};const p=panel([ok(enabled),ok({...enabled,contextEnabled:false})]);p.render();await settle();let view=p.render();assert.equal(p.nodes(view).filter(n=>n.type==='input'&&n.props.type==='number').length,4);
 await p.nodes(view).find(n=>n.type==='label'&&n.props.key==='contextEnabled').children[0].props.onChange({target:{checked:false}});await settle();view=p.render();assert.equal(p.nodes(view).filter(n=>n.type==='input'&&n.props.type==='number').length,2);assert.ok(!p.nodes(view).some(n=>n.props.key==='contextImages'));
});

test('settings page accepts partial values without requiring newer optional keys',async()=>{
 const p=panel([ok({referenceContext:true,shortcutEnabled:true})]);p.render();await settle();const view=p.render();
 assert.ok(p.find(view,'select'));
 assert.equal(p.calls.length,1);
});

test('composer file-content preference prefers the new key while retaining names and legacy fallback',async()=>{
 const file={name:'C:/private/notes.md',size:4,arrayBuffer:async()=>new Uint8Array([116,101,115,116]).buffer};
 const owner={resolveDraftAttachments:async()=>[{kind:'file',file}]};
 const modernOff=await composerReader.readComposerFiles(owner,null,['id'],{values:{composerFiles:false,referenceFiles:true}});
 assert.deepEqual(Array.from(modernOff.names),['notes.md']);assert.equal(modernOff.files.length,0);
 const modernOn=await composerReader.readComposerFiles(owner,null,['id'],{values:{composerFiles:true,referenceFiles:false}});
 assert.equal(modernOn.files[0]?.textPreview,'test');
 const legacy=await composerReader.readComposerFiles(owner,null,['id'],{values:{referenceFiles:true}});
 assert.equal(legacy.files[0]?.textPreview,'test');
});

test('model choice atomically selects fixed route or follows session',async()=>{
 const p=panel([ok({...defaults,useCustomModel:true,enhanceProvider:'p',enhanceModel:'m'}),ok({...defaults,useCustomModel:false}),ok({...defaults,useCustomModel:true,enhanceProvider:'p',enhanceModel:'m'})],[{id:'p',models:[{id:'m'}]}]);p.render();await settle();let view=p.render();
 const picker=v=>p.nodes(v).filter(n=>n.type==='select')[1];
 await picker(view).props.onChange({target:{value:''}});assert.deepEqual(JSON.parse(p.calls[1].body),{useCustomModel:false,enhanceProvider:'',enhanceModel:''});
 await settle();view=p.render();assert.equal(picker(view).props.disabled,false);await picker(view).props.onChange({target:{value:JSON.stringify(['p','m'])}});assert.deepEqual(JSON.parse(p.calls[2].body),{useCustomModel:true,enhanceProvider:'p',enhanceModel:'m'});
});

test('saved shortcut enablement immediately updates active command gate',async()=>{const p=panel([ok({...defaults,shortcutEnabled:false}),ok({...defaults,shortcutEnabled:true})]);p.render();await settle();const box=p.nodes(p.render()).find(n=>n.props.key==='shortcutEnabled').children[0];box.props.onChange({target:{checked:true}});await settle();assert.equal(p.hooks.taskStore.shortcutAllowed(),true);});

test('Escape cancels recording without submitting a preference or changing the binding',async()=>{
 const p=panel([ok(defaults)]);p.render();await settle();p.find(p.render(),'button','Record binding').props.onClick();let prevented=false;
 p.find(p.render(),'button','Press a combination, or Esc to cancel').props.onKeyDown({code:'Escape',preventDefault(){prevented=true},stopPropagation(){}});
 assert.equal(prevented,true);assert.ok(p.find(p.render(),'button','Record binding'));assert.equal(p.calls.length,1);
});

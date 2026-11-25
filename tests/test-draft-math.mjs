import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// The DSH client is loaded as a factory rather than an ES module.
const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('const REFERENCE_PLACEHOLDER_RE');
const end = source.indexOf('const bytesToBase64', start);
assert.ok(start >= 0 && end > start, 'client projection helpers must be present');
const api = vm.runInNewContext(source.slice(start, end) + ';({draftForModel,planDraftReplacement,chipEntries})', { URL });
const label = '@D:/private/course/notes.pdf';
const occurrence = offset => ({ offset, length: 1, clipboardText: label });
const ranges = (draft, chips) => JSON.parse(JSON.stringify(api.planDraftReplacement('摘要', draft, chips)));

test('composer references expose the leaf, while typed text remains literal', () => {
  const draft = '看' + label + '并总结';
  assert.equal(api.draftForModel(draft, [occurrence(1)]), '看[附件1: notes.pdf]并总结');
  assert.equal(api.draftForModel(draft, []), draft);
});
test('replacement spans count each chip once, including adjacent chips after emoji', () => {
  const draft = '🙂' + label + label + '结束';
  assert.deepEqual(ranges(draft, [occurrence(2 + label.length), occurrence(2)]), {
    whole: false, segments: [{ start: 0, end: 2, text: '' }, { start: 4, end: 6, text: '摘要' }],
  });
});
test('chip-only draft inserts after the chip and plain draft can be replaced whole', () => {
  assert.deepEqual(ranges(label, [occurrence(0)]), { whole: false, segments: [{ start: 1, end: 1, text: '摘要' }] });
  assert.deepEqual(ranges('输入', []), { whole: true, text: '摘要' });
});
test('outdated attachment metadata refuses projection instead of sending a disk path', () => {
  assert.throws(() => api.draftForModel('看' + label, [occurrence(0)]));
});

function writer({ current = 'original', rev = 7, active = true, phase = 'plain', actions, occurrences = [] }) {
  const a = source.indexOf('const replaceDraft =');
  const b = source.indexOf('const undo =', a);
  assert.ok(a >= 0 && b > a);
  const latestDraft={current},latestRev={current:rev};
  const replace=vm.runInNewContext(source.slice(a, b) + ';replaceDraft', {
    taskStore: { isActive: id => active && id === 'a' }, sessionId: 'a', phaseRef: { current: phase },
    latestDraft, latestRev, occurrencesRef: { current: occurrences },
    chipEntries: api.chipEntries, inputActions: actions, sanitizeForInsert: value => value, planDraftReplacement: api.planDraftReplacement,
  });
  replace.latestDraft=latestDraft;replace.latestRev=latestRev;return replace;
}

test('a late result cannot overwrite another session, revision, phase or draft', () => {
  const writes = [];
  const actions = { setDraft: value => writes.push(value), captureInsertion: () => ({ draftRev: 7 }) };
  for (const scenario of [{ active: false }, { phase: 'busy' }, { rev: 8 }, { current: 'edited' }]) {
    assert.equal(writer({ ...scenario, actions })('new', 'original', 7).ok, false);
  }
  assert.deepEqual(writes, []);
  assert.equal(writer({ actions })('new', 'original', 7).ok, true);
  assert.deepEqual(writes, ['new']);
});

test('a refused segmented insert compensates only the exact partial editor state',async()=>{
 const h=harness(),a=h.mount('a','first#middle#last');a.click();await h.finish();
 a.render().render().render();assert.equal(a.raw,'##摘要');assert.equal(a.writes,3);
});

test('a concurrent composer edit is not overwritten after a segmented refusal',async()=>{
 const h=harness(),a=h.mount('a','first#middle#last');a.click();await h.finish();
 a.raw='manual';a.rev++;a.render().render();assert.equal(a.raw,'manual');
});

test('a refused chip edit never falls back to replacing the whole draft', () => {
  let rev = 7;
  const calls = [];
  const actions = {
    captureInsertion: () => ({ draftRev: rev }),
    insertText: (text, span) => { calls.push([text, span.draftRev]); rev++; return calls.length === 1; },
    setDraft: () => calls.push(['unexpected whole write']),
  };
  const current = '看' + label + '并总结';
  assert.equal(writer({ current, actions, occurrences: [occurrence(1)] })('摘要', current, 7).ok, false);
  assert.deepEqual(calls, [['摘要', 7], ['', 8]]);
});

// Exercise the actual mounted seat and its asynchronous producer/consumer. The
// fixture controls network completion and React commits independently.
function harness() {
  let inst, Seat, answer, resultBody={ok:true,kind:'enhanced',text:'摘要'};
  const tasks = {};
  const react = {
    createElement:(type,props,...children)=>({type,props:props||{},children}),
    useState(initial){const i=inst.i++, m=inst; if (!(i in m.slots)) m.slots[i]=initial; return [m.slots[i],v=>{m.slots[i]=typeof v==='function'?v(m.slots[i]):v}];},
    useRef(initial){const i=inst.i++; return inst.slots[i]??=( {current:initial} );},
    useEffect(fn,deps){const i=inst.i++,m=inst,old=m.slots[i]; if(!old||deps.some((v,j)=>v!==old.deps[j])){const entry=m.slots[i]={deps}; m.effects.push(()=>{old?.cleanup?.(); entry.cleanup=fn()});}},
    useCallback:fn=>fn,
  };
  let plugin;
  const window={__ModuleLoader__:{load:d=>{plugin=d.factory(()=>react)}}};
  const response=b=>({ok:true,json:async()=>b});
  const policy={ok:true,values:{referenceImages:false,referenceFiles:false}};
  vm.runInNewContext(source,{window,URL,AbortController,fetch:async(url,opts)=>{
    if(opts?.method==='POST') return new Promise(r=>{answer=()=>r(response(resultBody))});
    return response(url.includes('context-status')?{ok:true,hasContext:false}:policy);
  }});
  plugin.apply({effect(){},inject(){},get(){},locale:{bind:()=>x=>x},slots:{inject:(n,f)=>f(),register:(d,c)=>{if(d.name==='conversation.input.right') Seat=c}}});
  function mount(id, raw, rev=1){
    const m={slots:[],effects:[],raw,rev,phase:'plain',writes:0};
    const actions={captureInsertion:()=>({draftRev:m.rev}),insertText(value,s){assert.equal(s.draftRev,m.rev);m.raw=m.raw.slice(0,s.start)+value+m.raw.slice(s.end);m.rev++;m.writes++;return true;}};
    m.render=()=>{inst=m;m.i=0;const draft=m.raw.replaceAll('#',label);const chips=[];let pos=0;for(const c of m.raw){if(c==='#')chips.push(occurrence(pos));pos+=c==='#'?label.length:c.length;}
      const state={draft,draftRev:m.rev,phase:m.phase,occurrences:chips,attachmentIds:[]};
      const tree=Seat({sessionId:id,useInput:sel=>sel(state),useSession:sel=>sel({blank:true}),inputActions:actions,t:k=>k});
      m.tree=tree;const button=tree?.children.find(c=>c?.type==='button');m.click=button?.props.onClick;m.mode=button?.props['data-state'];m.effects.splice(0).forEach(fn=>fn());return m;};
    m.unmount=()=>m.slots.forEach(s=>s?.cleanup?.());return m.render();
  }
  const tick=()=>new Promise(r=>setImmediate(r));
  return {mount,tick,setResult:body=>{resultBody=body},finish:async()=>{await tick();assert.equal(typeof answer,'function');answer();await tick()}};
}

test('composer contains no reference controls and busy state uses a solid stop icon',async()=>{
 const h=harness(),a=h.mount('controls','draft');
 const nodes=n=>n&&typeof n==='object'?[n,...(n.children||[]).flatMap(nodes)]:[];
 assert.equal(nodes(a.tree).filter(n=>['details','input','section'].includes(n.type)).length,0);
 const idle=nodes(a.tree).find(n=>n.type==='button');assert.equal(idle.props['data-busy'],false);
 a.click();a.render();const loading=nodes(a.tree).find(n=>n.type==='button');assert.equal(loading.props['data-busy'],true);
 const icon=nodes(a.tree).find(n=>typeof n.type==='function'&&n.children.some(c=>c?.type==='rect'));assert.ok(icon);
 assert.ok(source.includes('background:var(--dsw-alias-brand-primary,#315fca);color:#fff'));
 await h.finish();
});

test('optional response reasons and unchanged notices retain host explanation',()=>{
 assert.match(source,/reason:typeof body\.reason === 'string' \? t\('reason\.' \+ body\.reason\) : ''/);
 assert.match(source,/result\.reason \? ' ' \+ result\.reason : ''/);
 assert.match(source,/notice:result\.reason \|\| null/);
});

test('completion while away lands only on the original remounted session',async()=>{
 const h=harness(),a=h.mount('a','one');a.click();a.unmount();const b=h.mount('b','two');await h.finish();b.render();assert.equal(b.writes,0);assert.equal(a.writes,0);b.unmount();const again=h.mount('a','one',9);again.render().render();assert.equal(again.raw,'摘要');assert.equal(again.writes,1);assert.equal(again.mode,'undo');
});
test('frozen composer parks completion; an intervening edit discards it',async()=>{
 const h=harness(),a=h.mount('a','one');a.click();a.phase='sending';a.render();await h.finish();a.render();assert.equal(a.writes,0);a.raw='typed';a.rev++;a.phase='plain';a.render().render();assert.equal(a.raw,'typed');assert.equal(a.writes,0);
});
test('confirmed segmented rewrite restores every gap around both chips exactly',async()=>{
 const h=harness(),a=h.mount('a','first#middle#last');a.click();await h.finish();a.render().render().render();assert.equal(a.raw,'##摘要');assert.equal(a.mode,'undo');a.click();a.render();assert.equal(a.raw,'first#middle#last');
});
test('clearing a sent draft removes restore and result notice permanently',async()=>{
 for(const kind of ['enhanced','unchanged']){
  const h=harness(),a=h.mount('sent','one');h.setResult({ok:true,kind,text:kind==='unchanged'?'one':'摘要',reason:'rewrite'});
  a.click();await h.finish();a.render().render().render();
  a.raw='';a.rev++;a.render().render();
  assert.equal(a.tree.children.filter(n=>n?.type==='button'&&n.props.className==='dsh-pp_skillCopy').length,0);
  assert.equal(a.tree.children.filter(n=>n?.type==='details').length,0);
  a.raw='next draft';a.rev++;a.render().render();
  assert.equal(a.tree.children.filter(n=>n?.type==='button'&&n.props.className==='dsh-pp_skillCopy').length,0);
 }
});
test('clearing during enhancement discards late completion without a notice',async()=>{
 const h=harness(),a=h.mount('sent-running','one');a.click();await h.tick();
 a.raw='';a.rev++;a.render().render();await h.finish();a.render().render();
 assert.equal(a.writes,0);assert.equal(a.mode,'idle');
 assert.equal(a.tree.children.filter(n=>n?.type==='details').length,0);
});

test('explicit restore survives manual edits and keeps chip gaps',async()=>{
 for(const original of ['one','first#middle#last']){
  const h=harness(),a=h.mount('restore',original);a.click();await h.finish();a.render().render().render();
  a.raw=original.includes('#')?'edited#between#tail':'manually edited';a.rev++;a.render().render();
  const button=a.tree.children.find(n=>n?.type==='button'&&n.props.className==='dsh-pp_skillCopy');assert.ok(button);
  button.props.onClick();a.render();assert.equal(a.raw,original);
 }
});
test('explicit restore refuses stale clicks and changed chips',async()=>{
 const h=harness(),a=h.mount('restore','first#middle#last');a.click();await h.finish();a.render().render().render();
 a.raw='edited#between#tail';a.rev++;a.render().render();const stale=a.tree.children.find(n=>n?.type==='button'&&n.props.className==='dsh-pp_skillCopy');
 a.raw='newer#between#tail';a.rev++;stale.props.onClick();assert.equal(a.raw,'newer#between#tail');
 a.raw='removed chips';a.rev++;a.render().render();const restore=a.tree.children.find(n=>n?.type==='button'&&n.props.className==='dsh-pp_skillCopy');restore.props.onClick();assert.equal(a.raw,'removed chips');
});
test('stale undo click refuses a newer editor revision before its render',async()=>{
 const h=harness(),a=h.mount('a','one');a.click();await h.finish();a.render().render().render();assert.equal(a.mode,'undo');const undo=a.click; a.raw='typing';a.rev++;undo();a.render().render();assert.equal(a.raw,'typing');assert.equal(a.writes,1);assert.notEqual(a.mode,'undo');
});

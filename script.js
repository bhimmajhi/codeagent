const $=s=>document.querySelector(s),log=$("#log"),ta=$("#in"),dlg=$("#dlg");
const P={
 anthropic:{n:"Anthropic",u:"https://api.anthropic.com",m:"claude-sonnet-5-5",a:1},
 openai:{n:"OpenAI",u:"https://api.openai.com/v1",m:"gpt-4o"},
 openrouter:{n:"OpenRouter",u:"https://openrouter.ai/api/v1",m:"anthropic/claude-sonnet-4.5"},
 groq:{n:"Groq",u:"https://api.groq.com/openai/v1",m:"llama-3.3-70b-versatile"},
 nvidia:{n:"NVIDIA NIM",u:"https://integrate.api.nvidia.com/v1",m:"meta/llama-3.3-70b-instruct"},
 gemini:{n:"Google Gemini",u:"https://generativelanguage.googleapis.com/v1beta/openai",m:"gemini-2.0-flash"},
 mistral:{n:"Mistral",u:"https://api.mistral.ai/v1",m:"mistral-large-latest"},
 deepseek:{n:"DeepSeek",u:"https://api.deepseek.com/v1",m:"deepseek-chat"},
 xai:{n:"xAI",u:"https://api.x.ai/v1",m:"grok-4"},
 custom:{n:"Custom (OpenAI-compatible)",u:"",m:""}
};
let S={prov:"openrouter",cfg:{},sys:"",proxyUrl:""},hist=[],ctl=null,tm=0;
try{Object.assign(S,JSON.parse(localStorage.getItem("ca1")||"{}"))}catch(e){}
if(!P[S.prov])S.prov="anthropic";
const save=()=>{try{localStorage.setItem("ca1",JSON.stringify(S))}catch(e){}};
const C=(id)=>{id=id||S.prov;const d=P[id];return Object.assign({key:"",model:d.m,url:d.u},S.cfg[id])};
const set=o=>{S.cfg[S.prov]=Object.assign(S.cfg[S.prov]||{},o);save();stat()};
const esc=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const scr=()=>{log.scrollTop=log.scrollHeight};
function add(c,h){const d=document.createElement("div");d.className=c;d.innerHTML=h;log.appendChild(d);scr();return d}
const sys=(t,e)=>add("s"+(e?" er":""),esc(t));
function stat(){const c=C();$("#stl").innerHTML=esc(P[S.prov].n)+" · "+esc(c.model||"no model")+" · <i class=\""+(c.key?"ok":"er")+"\">"+(c.key?"key set":"no key")+"</i>"}
const inl=s=>esc(s).replace(/`([^`\n]+)`/g,"<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>").replace(/^#{1,4} (.+)$/gm,"<b>$1</b>");
function md(t){
 const L=t.split("\n"),o=[];let buf=[],i=0;
 const flush=()=>{const s=buf.join("\n").replace(/^\n+|\n+$/g,"");if(s)o.push(inl(s));buf=[]};
 while(i<L.length){
  const m=L[i].match(/^\s{0,3}(`{3,}|~{3,})\s*(.*)$/);
  if(!m){buf.push(L[i++]);continue}
  flush();i++;
  const body=[];
  while(i<L.length){const c=L[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);if(c&&c[1][0]===m[1][0]&&c[1].length>=m[1].length)break;body.push(L[i++])}
  i++;
  const fi=W.fileInfo(m[2]);
  if(fi&&fi.op==="delete"){o.push('<div class="cb"><div class="ch"><span class="fd">delete '+esc(fi.path)+"</span></div></div>");continue}
  const lb=fi?'<span class="fp">'+esc(fi.path)+"</span>":"<span>"+esc(m[2].trim()||"code")+"</span>";
  o.push('<div class="cb"><div class="ch">'+lb+'<button class="cp">copy</button></div><pre>'+esc(body.join("\n"))+"</pre></div>")
 }
 flush();return o.join("")
}
function hi(){if(!C().key)sys("Add an API key to start: type /key or tap the status line above.")}
function busy(on){const b=$("#go"),e=$("#spin");b.textContent=on?"■":"↵";b.setAttribute("aria-label",on?"Stop":"Send");clearInterval(tm);if(!on){e.textContent="";return}
 const g=["✻","✽","✶","✳","✢"],t0=Date.now();let i=0;
 const f=()=>{e.textContent=g[i++%5]+" Working… "+Math.floor((Date.now()-t0)/1000)+"s"};f();tm=setInterval(f,300)}
async function rd(r,an,f){const R=r.body.getReader(),D=new TextDecoder();let b="";
 for(;;){const x=await R.read();if(x.done)break;b+=D.decode(x.value,{stream:true});const L=b.split("\n");b=L.pop();
  for(const l of L){if(l.indexOf("data:")!==0)continue;const d=l.slice(5).trim();if(!d||d==="[DONE]")continue;
   let j;try{j=JSON.parse(d)}catch(e){continue}
   if(j.type==="error")throw new Error((j.error&&j.error.message)||"stream error");
   const t=an?(j.type==="content_block_delta"&&j.delta&&j.delta.text):(j.choices&&j.choices[0]&&j.choices[0].delta&&j.choices[0].delta.content);
   if(t)f(t)}}}
async function send(txt,shown){
 const c=C(),p=P[S.prov],an=!!p.a;
 if(!S.proxyUrl&&!c.key){sys("No API key for "+p.n+". Run /key or tap the status line. If using Cloudflare Worker, enter its URL in Settings.",1);return}
 if(!S.proxyUrl&&(!c.url||!c.model)){sys("Base URL and model are required. Open settings.",1);return}
 hist.push({role:"user",content:txt});if(shown!==false)add("u",esc(shown||txt));const sy=sysFull();
 const out=add("a","");let acc="",raf=0;
 const draw=()=>{raf=0;out.innerHTML=md(acc);scr()};
 ctl=new AbortController();busy(1);
 try{
  if(S.proxyUrl){
   const r=await fetch(S.proxyUrl.replace(/\/+$/ ,"")+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:hist.slice(),system:sy}),signal:ctl.signal});
   if(!r.ok){let e=await r.text();try{const j=JSON.parse(e);e=j.error||j.message||e}catch(x){}throw new Error(r.status+" "+e)}
   const data=await r.json();acc=typeof data.reply==="string"?data.reply:"";draw();hist.push({role:"assistant",content:acc||"(empty)"});
  }else{
   const u=c.url.replace(/\/+$/ ,"")+(an?"/v1/messages":"/chat/completions"),h={"Content-Type":"application/json"},m=hist.slice();let b;
   if(an){h["x-api-key"]=c.key;h["anthropic-version"]="2023-06-01";h["anthropic-dangerous-direct-browser-access"]="true";b={model:c.model,max_tokens:8192,stream:true,messages:m,system:sy}}
   else{h.Authorization="Bearer "+c.key;b={model:c.model,stream:true,messages:[{role:"system",content:sy}].concat(m)}}
   const r=await fetch(u,{method:"POST",headers:h,body:JSON.stringify(b),signal:ctl.signal});
   if(!r.ok){let e=await r.text();try{const j=JSON.parse(e);e=(j.error&&(j.error.message||j.error))||j.message||e}catch(x){}throw new Error(r.status+" "+(typeof e==="string"?e:JSON.stringify(e)))}
   await rd(r,an,t=>{acc+=t;if(!raf)raf=requestAnimationFrame(draw)});draw();hist.push({role:"assistant",content:acc||"(empty)"});
  }
  applyReply(acc);
 }catch(e){
  const ab=e.name==="AbortError";
  if(acc){draw();hist.push({role:"assistant",content:acc})}else{out.remove();hist.pop()}
  sys(ab?"Interrupted.":(e instanceof TypeError?"Network or CORS error. This provider may block direct browser calls. Try OpenRouter, or set a proxy as Base URL in settings.":e.message),!ab);
 }finally{busy(0);ctl=null}
}
const HELP="/help  show this list\n/key [value]  set your API key (no value opens settings)\n/provider [id]  switch provider\n/model [name]  set model\n/system [text]  set system prompt\n/clear  clear the conversation\n/export  download chat as .md\n/settings  open settings\n/upload  open a ZIP project\n/check  check the project for problems\n/fix [what]  let the AI fix the project\n/zip [name]  download the project as a ZIP\n/files  list project files\n/undo  revert the last AI file changes\n/close  close the project\nesc  interrupt a reply";
function cmd(t){
 const a=t.split(/\s+/),c=a.shift(),r=a.join(" ");
 add("u",esc(c==="/key"&&r?"/key ••••••••":t));
 if(c==="/help")sys(HELP);
 else if(c==="/key"){if(r){set({key:r});sys("Key saved for "+P[S.prov].n+".")}else openSet()}
 else if(c==="/settings")openSet();
 else if(c==="/provider"){if(P[r]){S.prov=r;save();stat();sys("Provider: "+P[r].n+"  model: "+C().model)}else sys("Providers: "+Object.keys(P).join(", "))}
 else if(c==="/model"){if(r){set({model:r});sys("Model: "+r)}else sys("Model: "+C().model)}
 else if(c==="/system"){S.sys=r;save();sys(r?"System prompt set.":"System prompt cleared.")}
 else if(c==="/clear"){hist=[];log.innerHTML="";hi()}
 else if(c==="/export"){
  const t=hist.map(m=>"## "+m.role+"\n\n"+m.content).join("\n\n"),l=document.createElement("a");
  l.href=URL.createObjectURL(new Blob([t],{type:"text/markdown"}));l.download="chat.md";l.click();sys("Exported chat.md")}
 else if(c==="/upload")$("#zf").click();
 else if(c==="/zip")dl(r);
 else if(c==="/check")chk();
 else if(c==="/fix")fix(r,false);
 else if(c==="/files")ls();
 else if(c==="/undo")undo();
 else if(c==="/close")closeProj();
 else sys("Unknown command. Try /help.",1)}
function go(){const t=ta.value.trim();if(ctl||!t)return;ta.value="";fit();t[0]==="/"?cmd(t):send(t)}
const fit=()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,200)+"px"};
ta.addEventListener("input",fit);
ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&matchMedia("(pointer:fine)").matches){e.preventDefault();go()}});
$("#go").onclick=()=>ctl?ctl.abort():go();
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!mn.hidden){menu(0);pl.focus()}else if(ctl)ctl.abort()});
log.addEventListener("click",e=>{const a=e.target.closest("[data-act]");if(a){act(a.dataset.act);return}const b=e.target.closest(".cp");if(!b)return;
 navigator.clipboard.writeText(b.closest(".cb").querySelector("pre").textContent).then(()=>{b.textContent="copied";setTimeout(()=>{b.textContent="copy"},1200)}).catch(()=>{})});
/* settings */
$("#sp").innerHTML=Object.keys(P).map(k=>'<option value="'+k+'">'+P[k].n+"</option>").join("");
function fill(id){const c=C(id);$("#sk").value=c.key;$("#sm").value=c.model;$("#su").value=c.url}
function openSet(){$("#sp").value=S.prov;fill(S.prov);$("#sy").value=S.sys||"";$("#px").value=S.proxyUrl||"";$("#sk").type="password";$("#sh").textContent="show";dlg.showModal()}
$("#sp").onchange=e=>fill(e.target.value);
$("#sh").onclick=()=>{const k=$("#sk"),h=k.type==="password";k.type=h?"text":"password";$("#sh").textContent=h?"hide":"show"};
$("#ssv").onclick=()=>{const id=$("#sp").value,d=P[id];S.prov=id;
 S.cfg[id]={key:$("#sk").value.trim(),model:$("#sm").value.trim()||d.m,url:$("#su").value.trim()||d.u};S.sys=$("#sy").value;S.proxyUrl=$("#px").value.trim().replace(/\/+$/,"");save();stat();dlg.close()};
$("#srm").onclick=()=>{$("#sk").value="";const id=$("#sp").value;S.cfg[id]=Object.assign(S.cfg[id]||{},{key:""});save();stat()};
$("#scl").onclick=()=>dlg.close();
$("#stl").onclick=openSet;
/* project: "+" menu, upload / check / fix / download ZIP */
const mn=$("#mn"),pl=$("#plus"),pjb=$("#pj");
const sysFull=()=>[S.sys,W.PROTOCOL,W.snapshot()].filter(Boolean).join("\n\n");
function menu(on){mn.hidden=!on;pl.setAttribute("aria-expanded",on?"true":"false")}
function pj(){
 const w=W.ws,n=W.nChanged();
 pjb.hidden=!w.files.size;
 pjb.innerHTML=w.files.size?'<span class="nm"><b>'+esc(w.name)+"</b>  "+w.files.size+" files  "+W.fmt(W.size())+(n?"  "+n+" changed":"")+'</span><button data-act="fix">Fix</button><button data-act="zip">Download</button>':"";
 mn.querySelectorAll("[data-act]").forEach(b=>{if(b.dataset.act!=="up")b.disabled=!w.files.size})
}
function act(a){
 if(a==="up")$("#zf").click();
 else if(a==="zip")dl();
 else if(a==="chk")chk();
 else if(a==="fix"){const x=ta.value.trim();if(x&&x[0]!=="/"){ta.value="";fit()}fix(x&&x[0]!=="/"?x:"")}
 else if(a==="undo")undo()
 else if(a==="rm")closeProj()
}
function chk(){
 if(!W.ws.files.size){sys("No project yet. Tap + and upload a ZIP.",1);return null}
 const r=W.check();sys(W.report(r),r.some(x=>x.sev==="error"));return r
}
function fix(extra,echo){
 if(ctl){sys("Wait for the current reply to finish.",1);return}
 if(!W.ws.files.size){sys("No project yet. Tap + and upload a ZIP.",1);return}
 const rep=W.report(W.check());
 send("Review this project and fix every problem you find"+(extra?", starting with: "+extra:"")+".\n\nAutomatic check results:\n"+rep+"\n\nReturn each changed file in full as a file: block, then explain the changes briefly. If nothing needs fixing, say so.",
  echo===false?false:"/fix"+(extra?" "+extra:"")+"  ("+W.ws.files.size+" files + check results sent)")
}
async function dl(name){
 if(!W.ws.files.size){sys("No project yet. Upload a ZIP with +, or ask me to build something first.",1);return}
 try{
  const ents=W.entries(),blob=await Zip.write(ents),fn=W.outName(name),u=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=u;a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
  sys("Downloaded "+fn+"  "+ents.length+" files  "+W.fmt(blob.size))
 }catch(e){sys("Could not create the ZIP: "+e.message,1)}
}
async function up(f){
 if(!f)return;
 if(ctl){sys("Wait for the current reply to finish, then upload.",1);return}
 if(f.size>25*1048576){sys("That ZIP is larger than 25 MB.",1);return}
 if(W.ws.files.size&&W.nChanged()&&!confirm("Replace the current project? It has changes you have not downloaded."))return;
 try{
  W.load(await Zip.read(await f.arrayBuffer()),f.name.replace(/\.zip$/i,""));
  W.persist();pj();
  sys("Loaded "+f.name+"  "+W.ws.files.size+" files  "+W.fmt(W.size())+(W.ws.skipped?"  ("+W.ws.skipped+" skipped: node_modules, .git, system files)":""));
  chk();
  add("s",'<button class="ab" data-act="fix">Fix with AI</button><button class="ab" data-act="zip">Download ZIP</button>')
 }catch(e){sys("Could not open the ZIP: "+e.message,1)}
}
function ls(){
 const w=W.ws;if(!w.files.size){sys("No project loaded.");return}
 const d=W.diff(),mk=p=>d.added.includes(p)?"+ ":d.modified.includes(p)?"~ ":"  ",k=[...w.files.keys()].sort();
 sys(w.name+"  "+k.length+" files  (+ new, ~ changed)\n"+k.slice(0,200).map(p=>mk(p)+p+"  "+W.fmt(w.files.get(p).length)).join("\n")+(k.length>200?"\n… "+(k.length-200)+" more":"")+(d.deleted.length?"\ndeleted: "+d.deleted.join(", "):""))
}
function undo(){
 if(!W.undo()){sys("Nothing to undo.");return}
 W.persist();pj();sys("Reverted the last AI changes.")
}
function closeProj(){
 if(!W.ws.files.size){sys("No project to close.");return}
 if(W.nChanged()&&!confirm("Close the project? Changes you have not downloaded will be lost."))return;
 W.clear();W.persist();pj();sys("Project closed.")
}
function applyReply(t){
 try{
  const p=W.parse(t);if(!p.edits.length&&!p.cut.length)return;
  const r=W.apply(p.edits),L=[],ok=r.added.length+r.modified.length+r.deleted.length;
  if(r.added.length)L.push("created   "+r.added.join(", "));
  if(r.modified.length)L.push("updated   "+r.modified.join(", "));
  if(r.deleted.length)L.push("deleted   "+r.deleted.join(", "));
  r.skipped.forEach(x=>L.push("skipped   "+x));
  r.warn.forEach(x=>L.push("check      "+x));
  p.cut.forEach(x=>L.push("not applied   "+x+" (the reply was cut off before the file ended)"));
  if(ok){W.persist();pj()}
  if(!L.length){sys("The files in this reply match the project. Nothing changed.");return}
  add("s"+(ok?"":" er"),esc((ok?"✓ Project updated":"No files were changed")+"\n"+L.join("\n"))+(ok?'\n<button class="ab" data-act="zip">Download ZIP</button><button class="ab" data-act="undo">Undo</button>':""));
  if(ok){const ch=new Set(r.added.concat(r.modified)),bad=W.check().filter(x=>x.sev==="error"||(x.sev==="warn"&&ch.has(x.file)));
   if(bad.length)sys("Check after changes:\n"+bad.map(x=>(x.sev==="error"?"✗ ":"! ")+x.file+"  "+x.msg).join("\n"),bad.some(x=>x.sev==="error"));
   else sys("✓ Check after changes: no problems found.")}
 }catch(e){sys("Could not apply the file changes: "+e.message,1)}
}
pl.onclick=e=>{e.stopPropagation();menu(mn.hidden)};
document.addEventListener("click",e=>{if(!mn.hidden&&!mn.contains(e.target))menu(0)});
mn.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b&&!b.disabled){menu(0);act(b.dataset.act)}});
pjb.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b)act(b.dataset.act)});
$("#zf").onchange=e=>{const f=e.target.files[0];e.target.value="";up(f)};
stat();pj();hi();ta.focus();
W.restore().then(ok=>{if(ok){pj();sys("Restored project "+W.ws.name+"  "+W.ws.files.size+" files (kept in this browser).")}});
if("serviceWorker"in navigator&&location.protocol!=="file:")addEventListener("load",()=>navigator.serviceWorker.register("sw.js?v=4").catch(()=>{}));

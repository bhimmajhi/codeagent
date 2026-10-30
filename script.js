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
function stat(){const c=C();$("#stl").innerHTML='<i class="'+(c.key?"ok":"er")+'">●</i> '+esc(P[S.prov].n)+"  "+esc(c.model||"no model")+"  "+(c.key?"key set":"no key")}
function md(t){return t.split("```").map((p,i)=>{
 if(i%2){const n=p.indexOf("\n"),l=n<0?"":p.slice(0,n).trim(),c=n<0?p:p.slice(n+1);
  return '<div class="cb"><div class="ch"><span>'+esc(l||"code")+'</span><button class="cp">copy</button></div><pre>'+esc(c.replace(/\n$/,""))+"</pre></div>"}
 return esc(p.replace(/^\n+|\n+$/g,"")).replace(/`([^`\n]+)`/g,"<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>").replace(/^#{1,4} (.+)$/gm,"<b>$1</b>")}).join("")}
function hi(){add("wb",'<b style="color:var(--ac)">✻ Welcome to Code Agent ✻</b>\n<span class="d">/help for commands, /key to add your API key.\nYour key stays in this browser.</span>');if(!C().key)sys("Add an API key to start: type /key or tap the status line below.")}
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
async function send(txt){
 const c=C(),p=P[S.prov],an=!!p.a;
 if(!S.proxyUrl&&!c.key){sys("No API key for "+p.n+". Run /key or tap the status line. If using Cloudflare Worker, enter its URL in Settings.",1);return}
 if(!S.proxyUrl&&(!c.url||!c.model)){sys("Base URL and model are required. Open settings.",1);return}
 hist.push({role:"user",content:txt});add("u",esc(txt));
 const out=add("a","");let acc="",raf=0;
 const draw=()=>{raf=0;out.innerHTML=md(acc);scr()};
 ctl=new AbortController();busy(1);
 try{
  if(S.proxyUrl){
   const r=await fetch(S.proxyUrl.replace(/\/+$/ ,"")+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:hist.slice(),system:S.sys}),signal:ctl.signal});
   if(!r.ok){let e=await r.text();try{const j=JSON.parse(e);e=j.error||j.message||e}catch(x){}throw new Error(r.status+" "+e)}
   const data=await r.json();acc=typeof data.reply==="string"?data.reply:"";draw();hist.push({role:"assistant",content:acc||"(empty)"});
  }else{
   const u=c.url.replace(/\/+$/ ,"")+(an?"/v1/messages":"/chat/completions"),h={"Content-Type":"application/json"},m=hist.slice();let b;
   if(an){h["x-api-key"]=c.key;h["anthropic-version"]="2023-06-01";h["anthropic-dangerous-direct-browser-access"]="true";b={model:c.model,max_tokens:4096,stream:true,messages:m};if(S.sys)b.system=S.sys}
   else{h.Authorization="Bearer "+c.key;b={model:c.model,stream:true,messages:S.sys?[{role:"system",content:S.sys}].concat(m):m}}
   const r=await fetch(u,{method:"POST",headers:h,body:JSON.stringify(b),signal:ctl.signal});
   if(!r.ok){let e=await r.text();try{const j=JSON.parse(e);e=(j.error&&(j.error.message||j.error))||j.message||e}catch(x){}throw new Error(r.status+" "+(typeof e==="string"?e:JSON.stringify(e)))}
   await rd(r,an,t=>{acc+=t;if(!raf)raf=requestAnimationFrame(draw)});draw();hist.push({role:"assistant",content:acc||"(empty)"});
  }
 }catch(e){
  const ab=e.name==="AbortError";
  if(acc){draw();hist.push({role:"assistant",content:acc})}else{out.remove();hist.pop()}
  sys(ab?"Interrupted.":(e instanceof TypeError?"Network or CORS error. This provider may block direct browser calls. Try OpenRouter, or set a proxy as Base URL in settings.":e.message),!ab);
 }finally{busy(0);ctl=null}
}
const HELP="/help  show this list\n/key [value]  set your API key (no value opens settings)\n/provider [id]  switch provider\n/model [name]  set model\n/system [text]  set system prompt\n/clear  clear the conversation\n/export  download chat as .md\n/settings  open settings\nesc  interrupt a reply";
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
 else sys("Unknown command. Try /help.",1)}
function go(){const t=ta.value.trim();if(ctl||!t)return;ta.value="";fit();t[0]==="/"?cmd(t):send(t)}
const fit=()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,200)+"px"};
ta.addEventListener("input",fit);
ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&matchMedia("(pointer:fine)").matches){e.preventDefault();go()}});
$("#go").onclick=()=>ctl?ctl.abort():go();
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&ctl)ctl.abort()});
log.addEventListener("click",e=>{const b=e.target.closest(".cp");if(!b)return;
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
stat();hi();ta.focus();
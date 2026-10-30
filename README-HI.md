# Code Agent — ZIP project + Cloudflare Worker (Hindi)

Is ZIP mein Cloudflare Worker proxy ka option hai. Worker mode mein API key browser mein nahi, Cloudflare Secret mein rahegi.

## Naya kya hai: chat box ke left mein **+** button

**+** dabane par menu khulta hai:

| Option | Kya karta hai |
|---|---|
| Upload ZIP project | Apna project ZIP chuno. Agent use kholta hai aur turant check chala deta hai (JSON, JavaScript syntax, CSS braces, HTML mein toote links, leak hui API key). |
| Check project | Project ko dobara check karta hai. |
| Fix with AI | AI ko poora project + check report bheji jaati hai. AI jo files badalta hai woh project mein apply ho jaati hain. Chat box mein kuch likha ho (jaise "sirf style.css theek karo") to woh instruction ban jaata hai. |
| Download project as ZIP | Poora project (original + AI ke changes) naye ZIP mein download hota hai. Upload kiya tha to naam `<naam>-fixed.zip` hota hai. |
| Close project | Project band karta hai. |

Bina upload kiye bhi chalega: chat mein bolo "ek todo app banao" — AI files banayega, project ban jaayega, phir **Download** se ZIP le lo (`project.zip`).

Chat box ke upar project bar mein **Fix** aur **Download** shortcut hain.

### Commands
`/upload` `/check` `/fix [kya theek karna hai]` `/zip [naam]` `/files` `/undo` `/close`

- `/undo` AI ke last file changes wapas kar deta hai.
- Project is browser mein save rehta hai (IndexedDB), page reload karne par wapas aa jaata hai.

### Dhyan rakhein
- ZIP maximum 25 MB. `node_modules`, `.git`, `__MACOSX` skip ho jaate hain.
- AI ko sirf text files jaati hain (~60,000 characters tak). Images/binary, `.env`, `*.pem`, `*.key` aur bahut badi files AI ko **nahi** bheji jaati aur AI unhe badal nahi sakta. Woh ZIP mein jyon ki tyon rehti hain.
- Baaki text files aapke chune hue AI provider ko jaati hain. Koi secret files mein ho to pehle hata dein.
- Agar AI ne file adhoori bheji (chhoti ho gayi ya "rest unchanged" likha), to chat mein "check" warning aati hai — **Undo** dabayein.
- Original ZIP kabhi change nahi hota; naya ZIP alag se banta hai.

## 1. GitHub Pages par upload
1. ZIP extract karein. `codeagent-main` folder ki **sabhi** files repository ke root mein upload karein (`index.html`, `style.css`, `script.js`, **`zip.js`**, **`ws.js`**, `worker.js`, `README-HI.md`). `zip.js` aur `ws.js` nayi hain — inke bina **+** menu nahi chalega.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `/(root)` → Save.
3. Allowed website origin `https://bhimmajhi.github.io` set hai.

## 2. Cloudflare Worker deploy (dobara karna zaroori)
`worker.js` mein limits badhai gayi hain taaki poora project bheja ja sake (request 400 KB, jawab 8192 tokens). Purana Worker chalega, par bade project par error dega ya jawab beech mein kat jaayega.

1. https://dash.cloudflare.com/ par login karein → Workers & Pages → apna Worker kholein.
2. Worker editor mein is ZIP ki `worker.js` ka poora code paste karke Deploy karein.
3. Worker Settings → Variables and Secrets mein `OPENROUTER_API_KEY` naam ka Secret banayein aur apni OpenRouter API key usmein paste karein. (Pehle README mein `NVIDIA_API_KEY` likha tha, par `worker.js` `OPENROUTER_API_KEY` hi padhta hai.) Key ko GitHub par upload na karein.
4. Agar aapka Pages origin alag hai, `worker.js` ke `ALLOWED_ORIGINS` mein exact origin badal kar redeploy karein.

## 3. Website connect karein
1. Website reload karein; status line par tap karke Settings kholein.
2. `Cloudflare Worker URL` mein deployed Worker URL dalein, jaise `https://code-agent-api.YOUR-SUBDOMAIN.workers.dev`.
3. Worker mode mein browser API Key field zaroori nahi; key Cloudflare Secret se aati hai. Save karke chat try karein.

## 4. Direct API mode
Worker URL khaali chhodne par selected provider ko direct browser request jayegi. Kuch providers CORS ya hosting restrictions ki wajah se fail kar sakte hain. 405/CORS aaye to Worker mode use karein.

**Note:** Worker ko aapke Cloudflare account mein deploy karna aur secret set karna aapko karna hoga. Main aapke account mein login nahi kar sakta.

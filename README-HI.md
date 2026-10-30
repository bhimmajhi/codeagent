# Code Agent — 405 Error Fix (Hindi)

Is ZIP mein Cloudflare Worker proxy ka option diya gaya hai. Worker mode mein API key browser mein nahi, Cloudflare Secret mein rahegi.

## 1. GitHub Pages par upload
1. ZIP extract karein. `codeagent-main` folder ki sabhi files repository ke root mein upload karein.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `/(root)` → Save.
3. Screenshot ke mutabik allowed website origin `https://bhimmajhi.github.io` set hai.

## 2. Cloudflare Worker deploy
1. https://dash.cloudflare.com/ par login karein → Workers & Pages → Create Worker.
2. Worker editor mein is ZIP ki `worker.js` ka poora code paste karke Deploy karein.
3. Worker Settings → Variables and Secrets mein `NVIDIA_API_KEY` naam ka Secret banayein aur apni NVIDIA API key usmein paste karein. Key ko GitHub par upload na karein.
4. Agar aapka Pages origin alag hai, `worker.js` ke `ALLOWED_ORIGINS` mein exact origin badal kar redeploy karein.

## 3. Website connect karein
1. Website reload karein; status line par tap karke Settings kholein.
2. `Cloudflare Worker URL` mein deployed Worker URL dalein, jaise `https://code-agent-api.YOUR-SUBDOMAIN.workers.dev`.
3. Worker mode mein browser API Key field zaroori nahi; key Cloudflare Secret se aati hai. Save karke chat try karein.

## 4. Direct API mode
Worker URL khaali chhodne par selected provider ko direct browser request jayegi. Kuch providers CORS ya hosting restrictions ki wajah se fail kar sakte hain. 405/CORS aaye to Worker mode use karein.

**Note:** ZIP ka code update hai, lekin Worker ko aapke Cloudflare account mein deploy karna aur NVIDIA secret set karna aapko karna hoga. Main aapke account mein login nahi kar sakta.

# Code Agent — Large Project Upgrade (Hindi)

Is build mein large-project context selection, 10,000-file workspace, 100 MB ZIP upload guard, aur NVIDIA NIM Worker support add kiya gaya hai.

## Kya upgrade hua

- ZIP reader: 12,000 archive entries tak; workspace mein 10,000 usable files tak.
- ZIP upload: 100 MB compressed limit; unpacked size limit 300 MB. Mobile browser ki RAM ke hisaab se chhota project behtar rahega.
- AI context: poora project tree + task ke keywords, manifests, README aur source filenames ke hisaab se relevant files pehle select hoti hain. 135,000 characters tak source context diya jaata hai.
- Secrets (`.env`, keys, certificates) AI ko nahi bheje jaate. Binary files ko bhi preserve kiya jaata hai.
- AI response se complete `file:` blocks apply hote hain; Undo aur ZIP download available hain.
- Worker request/system/output limits bade project ke liye badhaye gaye.
- NVIDIA NIM ko Worker ka preferred provider banaya gaya.

## Important limitation

GitHub Pages + Cloudflare Worker browser mein project ko read, analyze aur AI se edit kar sakte hain, lekin Worker khud `npm install`, terminal, build ya test command nahi chala sakta. Isliye AI ko real build/test chalane ka daawa nahi karna chahiye. Real command execution ke liye alag isolated sandbox/container runner service chahiye; use public Worker mein unsafe shell ke roop mein expose na karein.

## GitHub Pages deploy

1. ZIP extract karke `codeagent-main` ke andar ki sab files repository root mein upload karein.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `/(root)`.
3. Agar aapka GitHub Pages origin `https://bhimmajhi.github.io` se alag hai, `worker.js` mein `ALLOWED_ORIGINS` ko exact origin se update karein.

## Cloudflare Worker deploy (zaroori)

1. Cloudflare Dashboard → Workers & Pages → apna Worker → Edit code.
2. Is ZIP ka poora `worker.js` paste karke Deploy karein.
3. Worker → Settings → Variables and Secrets mein ye secret add karein:
   - Name: `NVIDIA_API_KEY`
   - Value: aapki NVIDIA NIM API key (`nvapi-...`)
4. Optional variable `NVIDIA_MODEL` set kar sakte hain. Default: `meta/llama-3.3-70b-instruct`. Apne NVIDIA account par available model ID use karein.
5. Fallback chahiye to `GROQ_API_KEY` ya `OPENROUTER_API_KEY` secrets bhi add kar sakte hain.
6. Worker URL website Settings ke `Cloudflare Worker URL` field mein save karein.

**API key GitHub repository ya browser settings mein mat daalein.** Worker secret mein rakhein.

## Bade project par kaise kaam karein

1. ZIP upload karein.
2. Pehle poochhein: `Analyze the architecture. Read the project manifests, entry points, routing, data flow and important modules. Do not edit files yet. Clearly list files you actually inspected.`
3. Phir ek focused task dein, jaise `Fix authentication flow across frontend and backend. Inspect every relevant file and update all required files.`
4. Changes ke baad `/check` chalayein, `/undo` se rollback kar sakte hain, aur `/zip` se output download karein.

## Commands

`/upload` `/check` `/fix [instruction]` `/zip [name]` `/files` `/undo` `/close`

Original ZIP kabhi overwrite nahi hota; fixed project nayi ZIP mein download hota hai.


- AI ke through ek individual text file create/edit karne ki limit: 50 MB. Bahut badi files ko chhote sections mein edit karna behtar hai.

# Code Agent — Hindi Setup Guide

Is guide se tum apni AI coding website ko GitHub Pages aur NVIDIA API ke saath connect kar sakte ho.

## Zaroori cheezein

- GitHub account
- Cloudflare account
- NVIDIA API key
- Android phone ya computer

## Step 1: GitHub Repository Banao

1. https://github.com/new kholo.
2. Repository name mein `code-agent` likho.
3. Public ya Private select karo.
4. Create repository par click karo.
5. Repository ke andar `Add file` → `Create new file` par click karo.
6. File name mein `index.html` likho.
7. Apni `index.html` file ka poora code paste karo.
8. `Commit changes` par click karke save karo.

## Step 2: GitHub Pages Enable Karo

1. Apni repository kholo.
2. `Settings` par click karo.
3. Side menu mein `Pages` kholo.
4. Build and deployment section mein `Deploy from a branch` select karo.
5. Branch mein `main` select karo.
6. Folder mein `/(root)` select karo.
7. `Save` par click karo.
8. Thodi der baad tumhari website ka URL milega.

Example:

https://YOUR-USERNAME.github.io/code-agent/

Apne GitHub username ko `YOUR-USERNAME` ki jagah likhna.

## Step 3: Cloudflare Worker Banao

1. https://dash.cloudflare.com/ kholo.
2. Apne Cloudflare account mein sign in karo.
3. `Workers & Pages` section kholo.
4. Naya Worker create karo.
5. Worker ka naam `code-agent-api` rakho.
6. Worker ke code editor ko kholo.
7. Wahan pehle se maujood code ko replace karo.
8. Apni `worker.js` file ka poora code paste karo.
9. `Deploy` par click karo.

## Step 4: NVIDIA API Key Secure Karo

1. Cloudflare dashboard mein apna `code-agent-api` Worker kholo.
2. `Settings` section kholo.
3. `Variables and Secrets` option dhoondo.
4. Naya Secret add karo.

Secret name:

NVIDIA_API_KEY

Secret value:

Apni NVIDIA API key yahan Cloudflare ke Secret field mein paste karo.

5. Secret ko save karo.
6. Agar zaroorat ho, Worker ko dobara deploy karo.

IMPORTANT:
- NVIDIA API key ko `index.html` mein kabhi mat daalna.
- API key ko public GitHub repository mein kabhi upload mat karna.
- Apni API key kisi doosre vyakti ko mat bhejna.

## Step 5: CORS Setting Configure Karo

Apni `worker.js` file mein yeh code dhoondo:

```javascript
const ALLOWED_ORIGINS = [
  "https://YOUR-USERNAME.github.io"
];
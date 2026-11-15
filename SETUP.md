# Clearance Ledger: setup

Barcode scan, the maths and your haul work with no setup. Photo ID needs Jinx.

## On Jinx (once)
1. Install Tailscale (tailscale.com/download), sign in. Do the same on your iPhone, same account.
2. Tailscale admin console > DNS: turn on MagicDNS, then HTTPS Certificates.
3. PowerShell: `ollama pull qwen2.5vl:7b`
4. Windows Start > "Edit environment variables for your account" > New: name `OLLAMA_ORIGINS`, value = the app's address (the Setup tab shows it under "Commands for Jinx"). Quit Ollama from the tray, reopen it.
5. PowerShell as Administrator:
   - `tailscale serve --bg --https=8443 http://127.0.0.1:11434` (Ollama)
   - `tailscale serve --bg "C:\path\to\clearance-ledger"` (the app)
   If the app address shows a file list instead of the app, run a static server in that folder (`npx serve -l 8080`) and use `tailscale serve --bg 8080` instead.

## On iPhone
1. Safari > your Jinx address (`https://jinx.<tailnet>.ts.net`).
2. Share > Add to Home Screen.
3. Open the app > Setup > Jinx address `https://jinx.<tailnet>.ts.net:8443` > Save and test.

## Updating
Change `VERSION` in `sw.js`, replace the files. The app shows "new version ready, Reload".

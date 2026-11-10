SPL Admin - Render deployment fix

Files:
- server.js: starts a small Node HTTP server and serves the admin HTML.
- index.html: your supplied admin_updated2.html, unchanged.
- package.json: npm start runs node server.js.

Render settings:
- Runtime: Node
- Build Command: npm install
- Start Command: npm start
- Root Directory: leave blank if these files are at the repository root.

Important:
This fixes the missing server.js deployment crash. The page uses Firebase directly in the browser.
Firebase Authentication users, Realtime Database rules, and the admin record at admins/{uid}
must still be configured correctly. The /health endpoint only checks that the web server is running.

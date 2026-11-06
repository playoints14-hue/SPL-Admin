SPL ADMIN PANEL — UPDATED FILES

Files:
- admin.html: Admin UI with updated withdrawal review and premium bordered buttons.
- server.js: Admin backend; admin UID allowlist and Firebase ID token verification; read-only WPAY order list; protected password reset for users with authUid.
- package.json: Render start configuration.

Render Environment:
ADMIN_UIDS=আপনার Admin Firebase UID
USER_DATABASE_URL=https://splora-7abad-default-rtdb.asia-southeast1.firebasedatabase.app
FIREBASE_PROJECT_ID=splora-7abad
FIREBASE_SERVICE_ACCOUNT_JSON=আপনার Firebase service account JSON

Admin Panel UI reads/writes Firebase Realtime Database directly for most management functions.
Withdrawal approval:
- Approve means funds were sent outside the site; wallet balance is deducted once via user-record transaction.
- User withdrawal history is updated to “সম্পন্ন” or “ব্যর্থ”; pending stays “অপেক্ষমাণ”.
- Firebase Rules must permit authorized Admin writes to withdrawal_requests and user records. Without correct Rules, Firebase will reject the action.

Do not upload service account JSON into this ZIP or frontend.

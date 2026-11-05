SPL USER + ADMIN + BACKEND SETUP

ফাইলসমূহ:
- index_updated_v2.html : User Panel
- admin.html            : Admin Panel
- server.js             : WPAY Collect API এবং payment callback backend
- package.json          : Node.js dependencies/start script
- .env.example          : Hosting environment variables-এর নমুনা

Firebase:
এই দুই HTML ফাইলের Firebase project হলো splora-7abad। Firebase Authentication-এ Admin account তৈরি করুন। সেই Admin UID-র জন্য Realtime Database-এ admins/{UID} path-এ {"active":true} রাখুন। Firebase Database Rules-এ অনুমোদিত Admin-কে প্রয়োজনীয় read/write access দিতে হবে।

Backend deploy (Render বা অন্য Node hosting):
1. এই ফোল্ডার GitHub repository-তে দিন।
2. Build command: npm install
3. Start command: npm start
4. .env.example-এর মানগুলো Hosting-এর Environment Variables-এ বসান।
5. FIREBASE_SERVICE_ACCOUNT_JSON-এ splora-7abad project-এর নতুন Firebase service-account JSON দিন।
6. WPAY_API_SECRET Hosting secret হিসেবে দিন। এটি কখনো HTML, GitHub বা ZIP-এর মধ্যে রাখবেন না।
7. PUBLIC_BASE_URL-এ deploy করা HTTPS service URL দিন এবং WPAY notify callback URL /api/wpay/notify configure করুন।
8. User Panel একই origin/domain-এ serve করুন, কারণ এটি /api/wpay/collect endpoint-এ request পাঠায়। আলাদা domain হলে reverse proxy/API URL configure করতে হবে।

নিরাপত্তা:
- কথোপকথনে আগে প্রকাশিত Firebase service-account key বা WPAY secret revoke/rotate করে নতুন secret ব্যবহার করুন।
- .env ফাইল GitHub-এ commit করবেন না। .gitignore-এ .env যোগ করুন।
- Admin UID অবশ্যই splora-7abad project-এর Firebase Auth UID হবে।

গুরুত্বপূর্ণ সীমাবদ্ধতা:
- User Panel-এর ২৪ ঘণ্টার আয়-সংক্রান্ত বিদ্যমান কোড এই প্যাকেজে অপরিবর্তিত রাখা হয়েছে; এই backend সেটিকে নতুন করে schedule করে না।
- Admin Panel Firebase Realtime Database-এ সরাসরি কাজ করে; Database Rules সঠিক না হলে অপশনগুলো permission denied দেখাবে।
- WPAY callback code-এর প্রকৃত live transaction, signature ও production credential sandbox/live পরীক্ষা করা হয়নি। প্রথমে sandbox-এ পরীক্ষা করুন।
- Referral commission settings Admin Panel-এ সংরক্ষিত হয়; WPAY callback-এ ৩-লেভেল কমিশন স্বয়ংক্রিয় credit করার logic এই server.js-এ অন্তর্ভুক্ত নয়। সেটি চালু করার আগে referral parent mapping এবং deposit commission credit path নিশ্চিত করে backend logic যোগ করতে হবে।
- Admin Panel থেকে user password reset বর্তমানে HTML-এ নেই; Firebase Admin SDK endpoint ছাড়া এটি নিরাপদে করা যাবে না।

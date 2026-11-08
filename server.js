import express from 'express';
import admin from 'firebase-admin';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
const PORT = Number(process.env.PORT || 3000);
const ADMIN_UIDS = new Set((process.env.ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean));
const USER_DB_URL = process.env.USER_DATABASE_URL || 'https://splora-7abad-default-rtdb.asia-southeast1.firebasedatabase.app';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'splora-7abad';
if (!admin.apps.length) {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else {
    serviceAccount = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    };
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: USER_DB_URL
  });
}
const db = admin.database();
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(__dirname));

async function adminOnly(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Login required' });
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID
    });
    if (!ADMIN_UIDS.has(String(payload.sub))) return res.status(403).json({ message: 'Admin access denied' });
    req.adminUid = String(payload.sub);
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid admin session' });
  }
}

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'SPL Admin Backend' }));

// Read-only order listing. Payment crediting is exclusively handled by User Server callback.
app.get('/api/admin/wpay/orders', adminOnly, async (_req, res) => {
  try {
    const snap = await db.ref('wpay_orders').orderByChild('createdAt').limitToLast(150).get();
    const orders = [];
    snap.forEach(c => {
      const x = c.val() || {};
      orders.push({ orderId: c.key, phone: x.userPhone || '', amount: Number(x.amount || 0), status: x.status || 'pending', providerTransactionId: x.providerTransactionId || x.gatewayTransactionId || '', createdAt: x.createdAt || 0 });
    });
    orders.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ orders });
  } catch (e) {
    console.error('orders:', e);
    res.status(500).json({ message: 'Could not load deposits' });
  }
});

// Secure password update is available only for migrated users with an Auth UID.
// Legacy users currently store a plaintext password in RTDB and cannot be safely reset here.
app.post('/api/admin/users/:phone/password', adminOnly, async (req, res) => {
  try {
    const phone = String(req.params.phone || '');
    const password = String(req.body.password || '');
    if (!/^01[3-9]\d{8}$/.test(phone)) return res.status(400).json({ message: 'Invalid phone number' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const snap = await db.ref(`users/${phone}`).get();
    if (!snap.exists()) return res.status(404).json({ message: 'User not found' });
    const authUid = snap.val()?.authUid;
    if (!authUid) return res.status(409).json({ message: 'এই ইউজার এখনো Firebase Authentication-এ migrate হয়নি। নিরাপদ password reset করা যাচ্ছে না।' });
    await admin.auth().updateUser(String(authUid), { password });
    await db.ref(`users/${phone}`).update({ passwordResetAt: Date.now(), passwordResetBy: req.adminUid });
    res.json({ ok: true, message: 'Password updated' });
  } catch (e) {
    console.error('password update:', e);
    res.status(500).json({ message: 'Password update failed' });
  }
});

app.listen(PORT, () => console.log(`SPL Admin Backend listening on ${PORT}`));

import express from 'express';
import admin from 'firebase-admin';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

const PORT = Number(process.env.PORT || 3000);

const ADMIN_UIDS = new Set(
  (process.env.ADMIN_UIDS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
);

const USER_DB_URL =
  process.env.USER_DATABASE_URL ||
  'https://splora-7abad-default-rtdb.asia-southeast1.firebasedatabase.app';

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'splora-7abad';

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required');
}

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: USER_DB_URL
  });
}

const db = admin.database();

const jwks = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.static(__dirname));

/* =========================
   ADMIN AUTHENTICATION
========================= */

async function adminOnly(req, res, next) {
  try {
    const header = req.headers.authorization || '';

    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : '';

    if (!token) {
      return res.status(401).json({
        message: 'Login required'
      });
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID
    });

    if (!ADMIN_UIDS.has(String(payload.sub))) {
      return res.status(403).json({
        message: 'Admin access denied'
      });
    }

    req.adminUid = payload.sub;
    next();

  } catch (error) {
    console.error('Admin authentication error:', error);

    return res.status(401).json({
      message: 'Invalid admin session'
    });
  }
}

/* =========================
   ADMIN PANEL
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'SPL Admin Backend'
  });
});

/* =========================
   WPAY DEPOSIT HISTORY
   READ ONLY
========================= */

app.get('/api/admin/wpay/orders', adminOnly, async (req, res) => {
  try {
    const snap = await db
      .ref('wpay_orders')
      .orderByChild('createdAt')
      .limitToLast(150)
      .get();

    const orders = [];

    snap.forEach(child => {
      const data = child.val() || {};

      orders.push({
        orderId: child.key,
        phone: data.userPhone || '',
        amount: Number(data.amount || 0),
        method: data.method || '',
        status: data.status || 'pending',
        providerTransactionId:
          data.providerTransactionId ||
          data.gatewayTransactionId ||
          '',
        createdAt: data.createdAt || 0,
        paidAt: data.paidAt || 0
      });
    });

    orders.sort((a, b) => b.createdAt - a.createdAt);

    return res.json({ orders });

  } catch (error) {
    console.error('Load deposit orders error:', error);

    return res.status(500).json({
      message: 'Could not load deposit orders'
    });
  }
});

/* =========================
   ADMIN USER DETAILS
========================= */

app.get('/api/admin/users/:phone', adminOnly, async (req, res) => {
  try {
    const phone = String(req.params.phone || '');

    if (!/^01[3-9]\d{8}$/.test(phone)) {
      return res.status(400).json({
        message: 'Invalid phone number'
      });
    }

    const snap = await db.ref('users').child(phone).get();

    if (!snap.exists()) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    const user = snap.val() || {};

    return res.json({
      phone,
      name: user.name || '',
      balance: Number(user.balance || 0),
      isBanned: Boolean(user.isBanned),
      withdrawalDisabled: Boolean(user.withdrawalDisabled),
      withdrawAccount: user.withdrawAccount || {},
      deposits: user.deposits || {},
      withdrawals: user.withdrawals || {}
    });

  } catch (error) {
    console.error('Load user error:', error);

    return res.status(500).json({
      message: 'Could not load user'
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`SPL Admin Backend listening on ${PORT}`);
});

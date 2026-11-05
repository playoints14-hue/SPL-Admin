import express from 'express';
import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
app.use(express.json({limit:'100kb'}));
app.use(express.urlencoded({extended:false,limit:'100kb'}));
const PORT = Number(process.env.PORT || 3000);
const WPAY_MCH_ID = String(process.env.WPAY_MCH_ID || '5375');
const WPAY_API_SECRET = process.env.WPAY_API_SECRET;
const WPAY_BASE_URL = (process.env.WPAY_BASE_URL || 'https://api.wpay.life').replace(/\/$/,'');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/,'');
const ADMIN_UIDS = new Set((process.env.ADMIN_UIDS || '').split(',').map(x=>x.trim()).filter(Boolean));
const USER_DB_URL = process.env.USER_DATABASE_URL || 'https://splora-7abad-default-rtdb.asia-southeast1.firebasedatabase.app';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'splora-7abad';
if (!WPAY_API_SECRET) console.warn('WARNING: WPAY_API_SECRET is not set');
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required (use a newly rotated key)');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({credential:admin.credential.cert(serviceAccount),databaseURL:USER_DB_URL});
const db=admin.database();
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
const sha=s=>crypto.createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');
function signParams(params){const sorted=Object.keys(params).filter(k=>k!=='sign'&&params[k]!==undefined&&params[k]!==null&&params[k]!=='').sort().map(k=>`${k}=${params[k]}`).join('&');return md5(`${sorted}&key=${WPAY_API_SECRET}`).toLowerCase();}
function verifySignature(p){if(!p.sign||!WPAY_API_SECRET)return false;const expected=signParams(p),actual=String(p.sign).toLowerCase();if(actual.length!==expected.length)return false;return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual));}
function publicUrl(path){if(!PUBLIC_BASE_URL)throw new Error('PUBLIC_BASE_URL is not configured');return `${PUBLIC_BASE_URL}${path}`;}
async function adminOnly(req,res,next){try{const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):'';if(!token) return res.status(401).json({message:'Login required'});const {payload}=await jwtVerify(token,jwks,{issuer:`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,audience:FIREBASE_PROJECT_ID});if(!ADMIN_UIDS.has(String(payload.sub)))return res.status(403).json({message:'Admin access denied'});req.adminUid=payload.sub;next();}catch(e){return res.status(401).json({message:'Invalid admin session'});}}
// Serve the Admin Panel at the Render root URL instead of returning Cannot GET /.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.get('/', (req,res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/health',(req,res)=>res.json({ok:true}));
app.post('/api/wpay/collect',async(req,res)=>{try{
  if(!WPAY_API_SECRET) return res.status(503).json({message:'Payment gateway is not configured'});
  const userPhone=String(req.body.userPhone||'').trim();const amount=Number(req.body.amount);const method=String(req.body.method||'').toLowerCase();
  if(!/^01[3-9]\d{8}$/.test(userPhone))return res.status(400).json({message:'Invalid user phone'});
  if(!Number.isFinite(amount)||amount<50||amount>50000)return res.status(400).json({message:'Invalid deposit amount'});
  const payType={bkash:'BKASH',nagad:'NAGAD',rocket:'ROCKET'}[method];if(!payType)return res.status(400).json({message:'Invalid payment method'});
  const userSnap=await db.ref(`users/${userPhone}`).get();if(!userSnap.exists())return res.status(404).json({message:'User account not found'});
  const orderId=`SPL${Date.now()}${crypto.randomInt(100000,999999)}`;
  const params={mchId:WPAY_MCH_ID,currency:'BDT',out_trade_no:orderId,pay_type:payType,money:amount.toFixed(2),attach:userPhone,notify_url:publicUrl('/api/wpay/notify'),returnUrl:publicUrl('/deposit/return')};
  params.sign=signParams(params);
  await db.ref(`wpay_orders/${orderId}`).set({orderId,userPhone,amount,method,status:'pending',createdAt:Date.now()});
  await db.ref(`users/${userPhone}/deposits/${orderId}`).set({amount,method,status:'অপেক্ষমাণ',out_trade_no:orderId,trxId:orderId,date:new Date().toLocaleDateString('bn-BD'),createdAt:Date.now()});
  const response=await fetch(`${WPAY_BASE_URL}/v1/Collect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});
  const result=await response.json();
  if(!response.ok||Number(result.code)!==0||!result.data?.url){await db.ref(`wpay_orders/${orderId}`).update({status:'create_failed',gatewayResponse:result});return res.status(502).json({message:result.msg||'WPAY could not create payment'});}
  await db.ref(`wpay_orders/${orderId}`).update({gatewayTransactionId:result.data.transaction_Id||null});
  return res.json({paymentUrl:result.data.url,orderId});
}catch(e){console.error('collect:',e);return res.status(500).json({message:'Payment request failed'});}});

app.post('/api/wpay/notify',async(req,res)=>{try{
  const p={...req.body};if(!verifySignature(p))return res.status(400).send('SIGN_ERROR');
  if(String(p.mchId||p.mch_id||'')!==WPAY_MCH_ID)return res.status(400).send('MERCHANT_ERROR');
  const orderId=String(p.out_trade_no||'').trim();const providerTx=String(p.transaction_Id||p.transaction_id||p.trxId||p.trade_no||'').trim();
  const status=String(p.status??p.trade_status??p.status_code??'');
  if(!orderId||!providerTx)return res.status(400).send('MISSING_TRANSACTION');
  if(status!=='1'&&status.toLowerCase()!=='success')return res.send('SUCCESS'); // pending/failed: no credit
  const orderRef=db.ref(`wpay_orders/${orderId}`);const snap=await orderRef.get();if(!snap.exists())return res.status(404).send('ORDER_NOT_FOUND');
  const order=snap.val();const paid=Number(p.money??p.amount??p.total_fee);if(!Number.isFinite(paid)||Math.abs(paid-Number(order.amount))>0.001)return res.status(400).send('AMOUNT_ERROR');
  const trxKey=sha(providerTx);const claimRef=db.ref(`used_transaction_ids/${trxKey}`);
  const claim=await claimRef.transaction(current=>{if(current===null)return {orderId,providerTransactionId:providerTx,claimedAt:Date.now()};if(current.orderId===orderId)return current;return;});
  if(!claim.committed)return res.status(409).send('TRANSACTION_ALREADY_USED');
  const userRef=db.ref(`users/${order.userPhone}`);
  const credit=await userRef.transaction(user=>{if(!user)return;user.balance=Number(user.balance||0);user.depositCredits=user.depositCredits||{};if(!user.depositCredits[orderId]){user.balance+=Number(order.amount);user.depositCredits[orderId]={amount:Number(order.amount),providerTransactionId:providerTx,creditedAt:Date.now()};}return user;});
  if(!credit.committed)return res.status(404).send('USER_NOT_FOUND');
  const patch={status:'success',providerTransactionId:providerTx,paidAt:Date.now()};
  await Promise.all([orderRef.update(patch),db.ref(`users/${order.userPhone}/deposits/${orderId}`).update({status:'সফল',providerTransactionId:providerTx,transactionId:providerTx,creditedAt:Date.now()})]);
  return res.send('SUCCESS');
}catch(e){console.error('notify:',e);return res.status(500).send('ERROR');}});

app.get('/api/admin/wpay/orders',adminOnly,async(req,res)=>{try{const snap=await db.ref('wpay_orders').orderByChild('createdAt').limitToLast(150).get();const orders=[];snap.forEach(c=>{const x=c.val()||{};orders.push({orderId:c.key,phone:x.userPhone,amount:x.amount,status:x.status,providerTransactionId:x.providerTransactionId||x.gatewayTransactionId||'',createdAt:x.createdAt||0});});orders.sort((a,b)=>b.createdAt-a.createdAt);res.json({orders});}catch(e){console.error(e);res.status(500).json({message:'Could not load deposits'});}});
app.listen(PORT,()=>console.log(`SPL WPAY backend listening on ${PORT}`));

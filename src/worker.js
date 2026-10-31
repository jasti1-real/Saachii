const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json; charset=utf-8"
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: corsHeaders });
const fail = (message, status = 400) => json({ error: message }, status);
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4)),c=>c.charCodeAt(0));
const randomId = (n=24) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s){return b64u(await crypto.subtle.digest("SHA-256",enc.encode(s)));}
async function passwordHash(password, salt=randomId(16)){
  const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:210000,hash:"SHA-256"},material,256);
  return salt+"."+b64u(bits);
}
async function passwordVerify(password, stored){
  const [salt,expected]=String(stored).split(".");
  const actual=(await passwordHash(password,salt)).split(".")[1];
  return actual===expected;
}
async function createSession(userId, env){
  const token=randomId(32), digest=await sha256(token), expires=Math.floor(Date.now()/1000)+60*60*24*7;
  await env.DB.prepare("INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)").bind(digest,userId,expires).run();
  return token;
}
async function authUser(request,env){
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const row=await env.DB.prepare("SELECT u.id,u.phone,u.full_name,u.referral_code,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>?").bind(await sha256(token),Math.floor(Date.now()/1000)).first();
  return row&&row.status==="active"?row:null;
}
async function referralCodeExists(env,code){return !!(await env.DB.prepare("SELECT id FROM users WHERE referral_code=?").bind(code).first());}
async function newReferralCode(env){for(let i=0;i<8;i++){const c="SA"+randomId(5).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);if(!(await referralCodeExists(env,c)))return c;}throw new Error("Could not create referral code");}
export default {
 async fetch(request,env){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
  const url=new URL(request.url), path=url.pathname;
  try {
   if(!env.DB)return fail("Database is not configured.",503);
   if(path==="/api/health"&&request.method==="GET")return json({ok:true,service:"Saachii API",mode:"integration-pending"});
   if(path==="/api/auth/register"&&request.method==="POST"){
    const b=await request.json();
    const phone=String(b.phone||"").trim(), name=String(b.fullName||"").trim(), password=String(b.password||"");
    const country=String(b.countryCode||"+256"), referral=String(b.referralCode||"").trim().toUpperCase();
    if(phone.length<7||phone.length>24)return fail("Enter a valid telephone number.");
    if(name.length<2||name.length>100)return fail("Enter your full name.");
    if(password.length<10)return fail("Use a password of at least 10 characters.");
    if(!["+256","+250","+260"].includes(country))return fail("Unsupported country code.");
    const existing=await env.DB.prepare("SELECT id FROM users WHERE phone=?").bind(phone).first();
    if(existing)return fail("An account with this telephone number already exists.",409);
    let referredBy=null;
    if(referral){const ref=await env.DB.prepare("SELECT id FROM users WHERE referral_code=? AND status='active'").bind(referral).first();if(!ref)return fail("Referral code was not found.");referredBy=ref.id;}
    const id=randomId(16), code=await newReferralCode(env), hash=await passwordHash(password);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,phone,full_name,password_hash,referral_code,referred_by,country_code) VALUES(?,?,?,?,?,?,?)").bind(id,phone,name,hash,code,referredBy,country),
      env.DB.prepare("INSERT INTO wallets(user_id) VALUES(?)").bind(id)
    ]);
    // Welcome bonus is NOT credited in this starter until its unlock/eligibility policy is explicitly configured.
    const token=await createSession(id,env);
    return json({token,user:{id,phone,fullName:name,referralCode:code},message:"Account created. Welcome-bonus policy requires configuration."},201);
   }
   if(path==="/api/auth/login"&&request.method==="POST"){
    const b=await request.json(), phone=String(b.phone||"").trim(), password=String(b.password||"");
    const u=await env.DB.prepare("SELECT id,phone,full_name,referral_code,password_hash,status FROM users WHERE phone=?").bind(phone).first();
    if(!u||u.status!=="active"||!(await passwordVerify(password,u.password_hash)))return fail("Telephone number or password is incorrect.",401);
    const token=await createSession(u.id,env);
    return json({token,user:{id:u.id,phone:u.phone,fullName:u.full_name,referralCode:u.referral_code}});
   }
   if(path==="/api/auth/logout"&&request.method==="POST"){
    const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(token)await env.DB.prepare("DELETE FROM sessions WHERE id_hash=?").bind(await sha256(token)).run();
    return json({ok:true});
   }
   const user=await authUser(request,env);
   if(path.startsWith("/api/")&&!user)return fail("Please log in.",401);
   if(path==="/api/me"&&request.method==="GET"){
    const [wallet,products]=await Promise.all([
      env.DB.prepare("SELECT balance_ugx,total_deposited_ugx,total_withdrawn_ugx,total_earned_ugx,referral_earned_ugx FROM wallets WHERE user_id=?").bind(user.id).first(),
      env.DB.prepare("SELECT up.id,up.status,up.purchased_at,p.name,p.price_ugx,p.listed_daily_income_ugx,p.duration_days FROM user_products up JOIN products p ON p.id=up.product_id WHERE up.user_id=? ORDER BY up.purchased_at DESC").bind(user.id).all()
    ]);
    return json({user,wallet,products:products.results||[]});
   }
   if(path==="/api/products"&&request.method==="GET"){
    const r=await env.DB.prepare("SELECT id,name,price_ugx,listed_daily_income_ugx,duration_days,enabled FROM products ORDER BY id").all();
    return json({products:r.results||[]});
   }
   if(path==="/api/transactions"&&request.method==="GET"){
    const r=await env.DB.prepare("SELECT id,type,amount_ugx,status,description,created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
    return json({transactions:r.results||[]});
   }
   if(path==="/api/referrals"&&request.method==="GET"){
    const r=await env.DB.prepare("SELECT phone,created_at FROM users WHERE referred_by=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
    return json({referralCode:user.referral_code,referrals:r.results||[],commissionRates:{level1:25,level2:2,level3:1}});
   }
   if(["/api/deposit","/api/withdraw","/api/purchases"].includes(path)&&request.method==="POST"){
    // Never accept client-asserted payment success or edit balances from the browser.
    return fail("This money-moving operation is disabled until verified MarzPay API credentials, webhook signature validation, and server-side settlement are configured.",503);
   }
   return fail("Route not found.",404);
  } catch(e) {
   return json({error:"Server error. Check Worker logs for the request ID."},500);
  }
 }
};

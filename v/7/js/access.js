// -----------------------------------------------------------------------
// access.js — invite-only, token-based gate (serverless, tamper-resistant).
//
// The source is public, so a shared secret would be forgeable. Instead we use
// asymmetric signatures: the PUBLIC key is embedded here (anyone can VERIFY an
// invite / user token) while the PRIVATE key is the ADMIN TOKEN (only the admin
// can MINT invites). Tokens are ECDSA-P256 signed and shared as links
// (…/app/?token=<token>). Nothing is checked against a server.
//
// This is a preview/invite gate, not hard security — a determined user can read
// the source and remove the gate. It stops casual access and gives a clean
// invite flow, which is exactly what "invite-only, admin-token access" needs.
//
// NOTE: shared links expose the linked job to anyone holding a valid token —
// do not put confidential client data behind a shared link.
// -----------------------------------------------------------------------

// Public key that matches the admin token. Anyone can verify with it.
const PUBLIC_KEY_B64 =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEGpG6Yzy8dRlJQ9LwwW6yOr3AYz7EUev2+XTVCWZUWVIPxf/1QKVZia0Ek1BNB3c/G2iYHFvhbyte9ltK685FmQ==';

const A_KEY   = 'jt.access';    // { grantedAt, via, label }
const ADM_KEY = 'jt.adminkey';  // admin private key (pkcs8 b64) — admin device only
const INV_KEY = 'jt.invites';   // locally-kept list of minted invites
const REV_KEY = 'jt.revoked';   // locally-revoked jti list

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBuf(b64){ const s=atob(b64); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i); return u.buffer; }
function bufToB64(buf){ const u=new Uint8Array(buf); let s=''; for(const b of u) s+=String.fromCharCode(b); return btoa(s); }
function b64url(b64){ return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unb64url(u){ u=u.replace(/-/g,'+').replace(/_/g,'/'); while(u.length%4) u+='='; return u; }

let _pub=null;
async function pub(){ return _pub ||= crypto.subtle.importKey('spki', b64ToBuf(PUBLIC_KEY_B64),
  { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']); }
async function importPriv(pkcs8b64){
  return crypto.subtle.importKey('pkcs8', b64ToBuf(pkcs8b64.trim()),
    { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
}

export const Access = new (class {
  // ---- grant state -----------------------------------------------------
  isGranted(){ try{ return !!JSON.parse(localStorage.getItem(A_KEY)||'null'); }catch{ return false; } }
  grant(via, label){ try{ localStorage.setItem(A_KEY, JSON.stringify({ grantedAt:Date.now(), via, label:label||'' })); }catch{} }
  info(){ try{ return JSON.parse(localStorage.getItem(A_KEY)||'null'); }catch{ return null; } }
  revokeSelf(){ localStorage.removeItem(A_KEY); }

  isAdmin(){ return !!localStorage.getItem(ADM_KEY); }
  lockAdmin(){ localStorage.removeItem(ADM_KEY); }

  // ---- token verification ---------------------------------------------
  async verifyToken(code){
    try{
      const [p, s] = String(code).trim().split('.');
      if(!p || !s) return { ok:false, reason:'malformed' };
      const okSig = await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' },
        await pub(), b64ToBuf(unb64url(s)), enc.encode(p));
      if(!okSig) return { ok:false, reason:'bad signature' };
      const payload = JSON.parse(dec.decode(b64ToBuf(unb64url(p))));
      if(payload.exp && Date.now() > payload.exp) return { ok:false, reason:'expired', payload };
      if(payload.jti && this.isRevoked(payload.jti)) return { ok:false, reason:'revoked', payload };
      return { ok:true, payload };
    }catch(e){ return { ok:false, reason:'invalid' }; }
  }

  // ---- revocation ------------------------------------------------------
  localRevoked(){ try{ return JSON.parse(localStorage.getItem(REV_KEY)||'[]'); }catch{ return []; } }
  isRevoked(jti){ return this.localRevoked().includes(jti); }
  revoke(jti){ const l=new Set(this.localRevoked()); l.add(jti); try{ localStorage.setItem(REV_KEY, JSON.stringify([...l])); }catch{}
    const inv=this.minted().map(x=>x.jti===jti?{...x,revoked:true}:x); try{ localStorage.setItem(INV_KEY, JSON.stringify(inv)); }catch{} }

  // Is this string the admin private key that matches our public key?
  async verifyAdminToken(token){
    try{
      const priv = await importPriv(token);
      const msg = enc.encode('jobtracker-admin-check');
      const sig = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, priv, msg);
      return crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, await pub(), sig, msg);
    }catch{ return false; }
  }
  async unlockAdmin(token){
    if(!await this.verifyAdminToken(token)) return false;
    try{ localStorage.setItem(ADM_KEY, token.trim()); }catch{}
    this.grant('admin', 'Admin');
    return true;
  }

  // ---- invite minting (admin only) ------------------------------------
  async mintInvite({ label='', days=0, job='' }={}){
    const token = localStorage.getItem(ADM_KEY);
    if(!token) throw new Error('Admin is locked');
    const priv = await importPriv(token);
    const iat = Date.now();
    const exp = days>0 ? iat + days*86400000 : 0;
    const jti = bufToB64(crypto.getRandomValues(new Uint8Array(6)).buffer).replace(/[^a-zA-Z0-9]/g,'').slice(0,8);
    const body = { v:1, label, iat, exp, jti };
    const p = b64url(bufToB64(enc.encode(JSON.stringify(body))));
    const sig = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, priv, enc.encode(p));
    const code = p + '.' + b64url(bufToB64(sig));
    // A share link may deep-link to a specific job.
    const hash = job ? `#job/${encodeURIComponent(job)}` : '';
    const link = `${location.origin}/app/?token=${encodeURIComponent(code)}${hash}`;
    this._remember({ label, iat, exp, jti, code, link, job });
    return { code, link, iat, exp, label, jti };
  }
  minted(){ try{ return JSON.parse(localStorage.getItem(INV_KEY)||'[]'); }catch{ return []; } }
  _remember(rec){ const l=this.minted(); l.unshift(rec); try{ localStorage.setItem(INV_KEY, JSON.stringify(l.slice(0,80))); }catch{} }
  forget(iat){ try{ localStorage.setItem(INV_KEY, JSON.stringify(this.minted().filter(x=>x.iat!==iat))); }catch{} }

  // ---- boot: consume ?token= / ?invite= from the URL ------------------
  async init(){
    const params = new URLSearchParams(location.search);
    const code = params.get('token') || params.get('invite');
    if(code){
      // Admin private key pasted as a link param unlocks admin directly.
      if(await this.verifyAdminToken(code)){ await this.unlockAdmin(code); }
      else {
        const r = await this.verifyToken(code);
        if(r.ok) this.grant('token', r.payload.label||'');
        else { this._strip(params); return { granted:this.isGranted(), inviteError:r.reason }; }
      }
      this._strip(params);
    }
    return { granted:this.isGranted() };
  }
  _strip(params){
    params.delete('token'); params.delete('invite');
    const clean = location.pathname + (params.toString()?`?${params}`:'') + location.hash;
    history.replaceState(null, '', clean);
  }
})();

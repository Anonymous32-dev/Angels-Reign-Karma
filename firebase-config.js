/* firebase-db.js
   Realtime Database + Firebase Auth over plain REST (no SDK needed).
   Load it AFTER firebase-config.js and BEFORE script.js.
   Gives script.js a `db` object with the same calls it already uses:
     db.doc('site/profile').get() -> { exists, data() }
     db.doc(path).set(obj) / .delete()
     db.collection('likes').get() -> { size }
*/
(function(){
  const C = window.FIREBASE_CONFIG || {};
  const BASE = String(C.databaseURL || '').replace(/\/+$/, '');
  const KEY = C.apiKey || '';
  const LS = 'fb_auth_v1';
  let auth = null; // { idToken, refreshToken, expiresAt, uid, email }

  function loadAuth(){ try{ auth = JSON.parse(localStorage.getItem(LS)); }catch(e){ auth = null; } }
  function saveAuth(){ try{ localStorage.setItem(LS, JSON.stringify(auth)); }catch(e){} }
  function clearAuth(){ auth = null; try{ localStorage.removeItem(LS); }catch(e){} }

  function applyAuth(j, keepEmail){
    const exp = parseInt(j.expiresIn || j.expires_in, 10) || 3600;
    auth = {
      idToken: j.idToken || j.id_token,
      refreshToken: j.refreshToken || j.refresh_token,
      expiresAt: Date.now() + (exp - 60) * 1000,
      uid: j.localId || j.user_id,
      email: j.email || keepEmail || ''
    };
    saveAuth();
  }

  async function authPost(endpoint, body){
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/' + endpoint + '?key=' + encodeURIComponent(KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    return j;
  }

  async function refresh(){
    const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(auth.refreshToken)
    });
    if(!r.ok) throw new Error('refresh failed');
    const keep = auth.email;
    applyAuth(await r.json(), keep);
  }

  async function token(){
    if(!auth) return null;
    if(Date.now() > auth.expiresAt){
      try{ await refresh(); }catch(e){ clearAuth(); return null; }
    }
    return auth.idToken;
  }

  async function rtdb(method, path, body, query){
    const t = await token();
    const url = BASE + '/' + path + '.json?' + (t ? 'auth=' + encodeURIComponent(t) + '&' : '') + (query || '');
    const opts = { method };
    if(body !== undefined){
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    if(!r.ok){
      const txt = await r.text().catch(() => '');
      throw new Error('RTDB ' + method + ' /' + path + ' -> ' + r.status + ' ' + txt);
    }
    return r.status === 204 ? null : r.json();
  }

  const db = {
    doc(path){
      return {
        async get(){
          const v = await rtdb('GET', path);
          return { exists: v !== null && v !== undefined, data: () => v };
        },
        async set(obj){ await rtdb('PUT', path, obj); },
        async delete(){ await rtdb('DELETE', path); }
      };
    },
    collection(name){
      return {
        async get(){
          const v = await rtdb('GET', name, undefined, 'shallow=true');
          return { size: v ? Object.keys(v).length : 0 };
        }
      };
    }
  };

  function isOwnerNow(){
    return !!(auth && auth.email && C.ownerEmail &&
      auth.email.toLowerCase() === String(C.ownerEmail).toLowerCase());
  }

  // Connects, restores a saved login, or signs in anonymously (needed for likes/views).
  async function start(){
    if(!BASE || !KEY){
      console.warn('[firebase-db] databaseURL or apiKey missing in firebase-config.js - using local-only mode');
      return { db: null, uid: null, isOwner: false };
    }
    loadAuth();
    if(auth) await token();
    if(!auth){
      try{ applyAuth(await authPost('accounts:signUp', { returnSecureToken: true })); }
      catch(e){ console.warn('[firebase-db] anonymous sign-in failed (enable Anonymous in Authentication > Sign-in method):', e.message); }
    }
    return { db, uid: auth ? auth.uid : null, isOwner: isOwnerNow() };
  }

  const NICE = {
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
    INVALID_PASSWORD: 'Wrong password.',
    EMAIL_NOT_FOUND: 'No user with that email in Firebase Authentication.',
    OPERATION_NOT_ALLOWED: 'Enable Email/Password in Firebase > Authentication > Sign-in method.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts - wait a bit and try again.'
  };

  function showLogin(){
    if(document.getElementById('fbLogin')) return;
    const box = document.createElement('div');
    box.id = 'fbLogin';
    box.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);padding:16px;';
    box.innerHTML =
      '<form id="fbLoginForm" style="width:min(320px,100%);background:rgba(20,12,6,.96);border:1px solid var(--accent2,#c4622a);border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:10px;color:var(--text,#f2e9df);font-family:inherit;">' +
      '<div style="font-size:14px;font-weight:600;">Owner login</div>' +
      '<input id="fbEmail" type="email" autocomplete="username" placeholder="email" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:inherit;font-family:inherit;">' +
      '<input id="fbPass" type="password" autocomplete="current-password" placeholder="password" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:inherit;font-family:inherit;">' +
      '<div id="fbErr" style="font-size:11px;color:#ff8a7a;min-height:14px;"></div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button type="submit" class="add-btn" style="flex:1;">Log in</button>' +
      '<button type="button" id="fbCancel" class="add-btn" style="flex:1;">Cancel</button>' +
      '</div></form>';
    document.body.appendChild(box);
    const email = box.querySelector('#fbEmail'), pass = box.querySelector('#fbPass'), err = box.querySelector('#fbErr');
    email.value = C.ownerEmail || '';
    (email.value ? pass : email).focus();
    box.querySelector('#fbCancel').onclick = () => { box.remove(); location.hash = '#view'; };
    box.querySelector('#fbLoginForm').onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = 'Signing in...';
      try{
        const j = await authPost('accounts:signInWithPassword', { email: email.value.trim(), password: pass.value, returnSecureToken: true });
        applyAuth(j);
        location.reload();
      }catch(ex){
        err.textContent = NICE[ex.message] || ex.message;
      }
    };
  }

  function logout(){ clearAuth(); location.hash = '#view'; location.reload(); }

  window.FB = { start, showLogin, logout };
})();

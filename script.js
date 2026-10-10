// ---- apply images from CONFIG ----
if(CONFIG.images.bannerVideo){
  document.getElementById('banner').innerHTML = `<video src="${CONFIG.images.bannerVideo}" autoplay muted loop playsinline></video>`;
} else if(CONFIG.images.banner){
  document.getElementById('banner').style.backgroundImage = `url('${CONFIG.images.banner}')`;
}
if(CONFIG.images.avatar){
  document.getElementById('avatar').innerHTML = `<img src="${CONFIG.images.avatar}" alt="avatar">`;
}
if(CONFIG.images.pageBackground){
  const v = document.getElementById('bgVideo');
  v.src = CONFIG.images.pageBackground;
  v.style.display = 'block';
}
// ---- image-or-video helpers (used by the card background and every tab background) ----
function isVideoUrl(u){ return /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(u || '') || /^data:video\//i.test(u || ''); }
function mediaHTML(u){
  return isVideoUrl(u)
    ? `<video src="${esc(u)}" autoplay muted loop playsinline></video>`
    : `<img src="${esc(u)}" alt="">`;
}
if(CONFIG.images.panelBackground){
  const pbg = document.createElement('div');
  pbg.className = 'panel-bg';
  pbg.innerHTML = mediaHTML(CONFIG.images.panelBackground);
  document.querySelector('.panel').prepend(pbg);
}
const contentBox = document.getElementById('contentBox');
if(CONFIG.images.contentVideo){
  contentBox.innerHTML = `<video src="${CONFIG.images.contentVideo}" autoplay muted loop playsinline></video>`;
} else {
  contentBox.textContent = 'video / content';
}

// ---- background audio: browsers block real autoplay-with-sound, so it starts on first tap ----
if(CONFIG.images.bgAudio){
  const audioEl = document.getElementById('bgAudio');
  const soundBtn = document.getElementById('soundBtn');
  const soundIcon = document.getElementById('soundIcon');
  audioEl.src = CONFIG.images.bgAudio;
  soundBtn.style.display = 'flex';
  let playing = false;

  function setIcon(on){
    soundIcon.innerHTML = on
      ? '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>'
      : '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>';
  }
  setIcon(false);

  function startAudio(){
    audioEl.play().then(()=>{ playing = true; setIcon(true); }).catch(()=>{});
  }
  document.body.addEventListener('click', function first(){
    if(!playing) startAudio();
    document.body.removeEventListener('click', first);
  });
  soundBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(playing){ audioEl.pause(); playing = false; setIcon(false); }
    else{ startAudio(); }
  });
}

document.getElementById('devicesRow').innerHTML = CONFIG.devices.map(d=>{
  const icons = {
    PC: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
    Laptop: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="10" rx="1.2"/><path d="M2 19h20l-2-4H4l-2 4z"/></svg>',
    Phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>'
  };
  return `<div class="device"><span class="ic">${icons[d]||'🔧'}</span>${d}</div>`;
}).join('');

function logoBox(item){
  if(item.logo){
    return `<div class="item-logo" style="background-image:url('${item.logo}')"></div>`;
  }
  return `<div class="item-logo">${item.icon}</div>`;
}

function renderGames(){
  return CONFIG.games.map(g=>`
    <div class="list-item"${g.bg ? ` style="background-image:url('${g.bg}')"` : ''}>
      ${logoBox(g)}
      <div class="item-text">
        <div class="label-row">${g.label}</div>
        <div class="sub-line">@${g.username} · id ${g.id}</div>
      </div>
    </div>`).join('');
}
function renderSocials(){
  return CONFIG.socials.map(s=>`
    <a class="list-item" href="${s.link}" target="_blank" rel="noopener"${s.bg ? ` style="background-image:url('${s.bg}')"` : ''}>
      ${logoBox(s)}
      <div class="item-text">
        <div class="label-row">${s.label}</div>
        ${s.desc ? `<div class="sub-line">${s.desc}</div>` : ''}
      </div>
      <span class="open-btn">Open</span>
    </a>`).join('');
}

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== shared state (profile + activity posts) lives in Firebase Realtime Database via firebase-db.js =====
let db = null, user = null, uid = null, isOwner = false, DATA_READY = false;

let activityPosts = [];

// same Spotify song saved twice -> keep only the newest one
function isMusicPost(p){ return p.label === 'Spotify' || p.label === 'Apple Music'; }
function spotifyKey(p){
  const l = (p.link || p.meta || '').trim().toLowerCase();
  // Apple Music keeps its ?i= (which song inside an album); Spotify ignores the query string
  return p.label === 'Apple Music' ? l : l.split('?')[0];
}
function dedupeSpotify(){
  const seen = new Set();
  const before = activityPosts.length;
  activityPosts = activityPosts.filter(p=>{
    if(!isMusicPost(p)) return true;
    const k = p.label + '|' + spotifyKey(p);
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if(activityPosts.length !== before) savePosts();
}

// tiny "last changed" stamp: other devices poll just this number, and only download the real data when it changes
async function bumpVersion(){
  try{ await db.doc('site/version').set(Date.now()); }catch(e){ console.error('version', e); }
}

async function savePosts(){
  if(db && isOwner){
    try{ await db.doc('site/activity').set({ posts: activityPosts }); await bumpVersion(); return true; }
    catch(e){ console.error('Could not save posts', e); return false; }
  } else if(!db){
    try{ localStorage.setItem('helloworld_activity_posts', JSON.stringify(activityPosts)); return true; }
    catch(e){ console.error('Could not save posts', e); return false; }
  }
  return true;
}

// Owner tools (the + buttons and the x remove buttons) are only shown in edit mode.
// With the database connected, edit mode follows "is this visitor the owner" and #view lets
// the owner preview the visitor view. Without a database, #edit / #view work as a local-only fallback.
let EDIT = false;
function localEditFallback(){
  try{
    if(location.hash === '#edit') localStorage.setItem('helloworld_edit', '1');
    if(location.hash === '#view') localStorage.removeItem('helloworld_edit');
    return localStorage.getItem('helloworld_edit') === '1';
  }catch(e){ return location.hash === '#edit'; }
}
window.addEventListener('hashchange', ()=> location.reload());

// ---- profile text: editable in edit mode, saved for every device/visitor ----
const PROFILE_KEY = 'helloworld_profile';
let profile = { name:CONFIG.name, title:CONFIG.title, username:CONFIG.username, id:CONFIG.id, bio:CONFIG.bio };

async function saveProfile(){
  if(db && isOwner){
    try{ await db.doc('site/profile').set(profile); await bumpVersion(); }
    catch(e){ console.error('Could not save profile', e); alert('Could not save your changes: ' + e.message); }
  } else if(!db){
    try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }catch(e){}
  }
}

// Built-in badge symbols (real SVG icons, not emoji) — pick one by name in CONFIG.badges via svg:'name'
const BADGE_ICONS = {
  shield: '<path d="M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5l7-3z"/>',
  star: '<path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.3l1.6-6.8L2.2 8.9l6.9-.6z"/>',
  diamond: '<path d="M12 2l5 6-5 14-5-14z"/>',
  bug: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7h6M12 3v4M7 10h10v6a5 5 0 0 1-10 0zM4 11l3 1M20 11l-3 1M4 18l3-1.5M20 18l-3-1.5"/></g>',
  rocket: '<g fill="currentColor"><path d="M12 2c3 2 4.3 6.3 3.2 10.6l-3.2 3-3.2-3C7.7 8.3 9 4 12 2z"/><circle cx="12" cy="9" r="1.4" fill="#1a1008"/><path d="M8.5 14.5 6 17l1.2 3L10 18M15.5 14.5 18 17l-1.2 3L14 18"/></g>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  crown: '<path d="M3 8l4 3 5-6 5 6 4-3-2 10H5z"/>',
  headphones: '<g fill="currentColor"><path d="M4 13v-1a8 8 0 0 1 16 0v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/></g>',
  wrench: '<path d="M21 7a4 4 0 0 1-5.3 3.8L9 17.5a2 2 0 1 1-2.8-2.8l6.7-6.7A4 4 0 1 1 21 7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-7-4.4-9.5-8.7C.8 8 2.3 4.5 5.7 4 8 3.6 10 5 12 7c2-2 4-3.4 6.3-3C21.7 4.5 23.2 8 21.5 11.3 19 15.6 12 20 12 20z"/>',
  gem: '<path d="M4 8l3-5h10l3 5-8 12z"/>',
  trophy: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 20h6M12 14v6"/></g>',
  fire: '<path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-2-1-3-1-5 2 2 3 5 3 8a6 6 0 0 1-12 0c0-4 2-6 4-10z"/>',
  flag: '<g fill="currentColor"><rect x="4" y="2" width="1.6" height="20"/><path d="M6 3h13l-3.2 4L19 11H6z"/></g>',
  medal: '<g fill="currentColor"><path d="M8 2l4 6 4-6h-3L12 5.5 11 2z"/><circle cx="12" cy="15" r="6"/></g>',
  gamepad: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M6 8h12a4 4 0 0 1 4 4l-1 5a2 2 0 0 1-3.4 1.4L15 16H9l-2.6 2.4A2 2 0 0 1 3 17l-1-5a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3"/></g><g fill="currentColor"><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></g>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>',
  sun: '<g fill="currentColor"><circle cx="12" cy="12" r="4"/></g><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></g>',
  skull: '<g fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6.5V19a2 2 0 0 0 2 2h1v-2h1v2h2v-2h1v2h1a2 2 0 0 0 2-2v-2.5c1.5-1.5 3-3.5 3-6.5a8 8 0 0 0-8-8z"/></g><g fill="#1a1008"><circle cx="9" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/></g>',
  ghost: '<g fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7v11l2.5-2 2 2 2.5-2.5 2.5 2.5 2-2 2.5 2V9a7 7 0 0 0-7-7z"/></g><g fill="#1a1008"><circle cx="9.5" cy="10" r="1.2"/><circle cx="14.5" cy="10" r="1.2"/></g>',
  key: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M14 3a5 5 0 0 0-4.9 6.1L2 16.2V21h4.8l1-1v-2h2v-2h2l2.1-2.1A5 5 0 1 0 14 3z"/></g><circle cx="16.5" cy="7.5" r="1.3" fill="currentColor"/>',
  lock: '<g fill="currentColor"><rect x="5" y="11" width="14" height="10" rx="2"/></g><path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
  paw: '<g fill="currentColor"><circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 12c-4 0-6 3-6 5.5A2.5 2.5 0 0 0 8.5 20c1 0 1.7-.6 3.5-.6s2.5.6 3.5.6a2.5 2.5 0 0 0 2.5-2.5c0-2.5-2-5.5-6-5.5z"/></g>',
  leaf: '<g fill="currentColor"><path d="M20 3C9 3 3 9 3 18v3h3c9 0 15-6 15-17V3h-1z"/></g><path d="M6 18c4-4 9-9 13-13" fill="none" stroke="#1a1008" stroke-width="1.5"/>',
  anchor: '<g fill="currentColor"><circle cx="12" cy="4" r="2"/></g><path d="M12 6v14M6 12H2a10 10 0 0 0 9 9M18 12h4a10 10 0 0 1-9 9M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  gift: '<g fill="currentColor"><rect x="3" y="9" width="18" height="12" rx="1.5"/><rect x="3" y="6" width="18" height="4" rx="1"/><path d="M12 6C9 6 8 3.5 9.5 2.3 11 1 12 3 12 6zM12 6c3 0 4-2.5 2.5-3.7C13 1 12 3 12 6z"/></g><path d="M12 6v15" stroke="#1a1008" stroke-width="2"/>',
  camera: '<g fill="currentColor"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/></g><circle cx="12" cy="13" r="3.5" fill="#1a1008"/>',
  music: '<path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><g fill="currentColor"><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></g>',
  infinity: '<path d="M6.5 8.5a4.5 4.5 0 1 0 0 7c2 0 3-1.5 5.5-4.5s3.5-4.5 5.5-4.5a4.5 4.5 0 1 1 0 9c-2 0-3-1.5-5.5-4.5S9 6.5 6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  target: '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></g><circle cx="12" cy="12" r="1.8" fill="currentColor"/>',
  puzzle: '<path d="M9 3h4v2a2 2 0 1 0 0 4v2h4a2 2 0 1 1 0 4h-2v2a2 2 0 1 1-4 0v-2H9a2 2 0 0 1-2-2v-2H5a2 2 0 1 1 0-4h2V5a2 2 0 0 1 2-2z"/>'
};
function svgBadgeHTML(name, color){
  const p = BADGE_ICONS[name];
  if(!p) return '';
  const styleAttr = color ? ` style="color:${esc(color)}"` : '';
  return `<svg class="badge" viewBox="0 0 24 24" fill="currentColor"${styleAttr}>${p}</svg>`;
}
function verifiedBadgeHTML(){
  if(CONFIG.images.badge) return `<img class="badge-img" src="${esc(CONFIG.images.badge)}" alt="Verified">`;
  return `<svg class="badge" viewBox="0 0 24 24" role="img" aria-label="Verified"><path fill="currentColor" d="M12 1.6l2.5 1.9 3.1-.2 1.1 2.9 2.8 1.5-.5 3.1L22.4 12l-1.4 2.4.5 3.1-2.8 1.5-1.1 2.9-3.1-.2L12 22.4l-2.5-1.9-3.1.2-1.1-2.9-2.8-1.5.5-3.1L1.6 12 3 9.6l-.5-3.1 2.8-1.5 1.1-2.9 3.1.2z"/><path d="M7.8 12.2l2.9 2.9 5.5-5.7" fill="none" stroke="#1a1008" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
// Discord-style badge strip: any number of badges, each its own hover tooltip (native title attr).
function badgeHTML(){
  const list = (CONFIG.badges && CONFIG.badges.length) ? CONFIG.badges : (CONFIG.verified ? [{type:'verified'}] : []);
  return list.map(b=>{
    if(b.type === 'verified'){
      return `<span class="badge-chip" title="Verified">${verifiedBadgeHTML()}</span>`;
    }
    if(b.icon){
      return `<span class="badge-chip" title="${esc(b.label||'')}"><img class="badge-img" src="${esc(b.icon)}" alt="${esc(b.label||'')}"></span>`;
    }
    if(b.svg){
      return `<span class="badge-chip" title="${esc(b.label||'')}">${svgBadgeHTML(b.svg, b.color)}</span>`;
    }
    return `<span class="badge-chip" title="${esc(b.label||'')}" style="color:${esc(b.color||'var(--accent)')}">${esc(b.emoji||'🏅')}</span>`;
  }).join('');
}
function renderProfile(){
  const ce = EDIT ? ' contenteditable="true" spellcheck="false"' : '';
  document.getElementById('nameRow').innerHTML = `<span class="ed" data-f="name"${ce}></span>`;
  document.getElementById('badgesRow').innerHTML = badgeHTML();
  document.getElementById('titleText').innerHTML = `<span class="ed" data-f="title"${ce}></span>`;
  document.getElementById('uidText').innerHTML = `@<span class="ed" data-f="username"${ce}></span> · id <span class="ed" data-f="id"${ce}></span>`;
  document.getElementById('bioText').innerHTML = `<span class="ed" data-f="bio"${ce}></span>`;
  document.querySelectorAll('[data-f]').forEach(el=>{
    el.textContent = profile[el.dataset.f] || '';
    if(!EDIT) return;
    el.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); el.blur(); } });
    el.addEventListener('paste', e=>{ e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g,' ')); });
    el.addEventListener('blur', ()=>{
      profile[el.dataset.f] = el.textContent.trim();
      saveProfile();
    });
  });
  const oldTag = document.querySelector('.edit-tag-fixed');
  if(oldTag) oldTag.remove();
  if(EDIT){
    const tag = document.createElement('div');
    tag.className = 'edit-tag-fixed';
    tag.textContent = db
      ? '✎ edit mode — signed in as the owner, changes sync to every device · #view to preview · #logout to sign out'
      : '✎ edit mode — click any dashed text · add #view to the address to leave';
    document.body.appendChild(tag);
  }
}

// Playlist tab: all saved Spotify songs / playlists

// Spotify's own compact player - needs no title/cover lookup
function spotifyEmbedUrl(link){
  const u = spotifyUri(link);
  if(!u) return null;
  const [, type, id] = u.split(':');
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
}
function spotifyEmbedHTML(link, h){
  const src = spotifyEmbedUrl(link);
  return src ? `<iframe src="${src}" height="${h}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Spotify player"></iframe>` : '';
}

// ---- Apple Music: Apple's own embed player (no title/cover lookup needed) ----
function isAppleMusicLink(link){ return /^https?:\/\/(geo\.)?music\.apple\.com\//i.test((link || '').trim()); }
function appleEmbedUrl(link){
  if(!isAppleMusicLink(link)) return null;
  try{
    const u = new URL(link.trim());
    u.hostname = 'embed.music.apple.com';
    u.searchParams.set('theme', 'dark');
    return u.toString();
  }catch(e){ return null; }
}
function appleEmbedHeight(link){
  // a single song (a /song/ link, or an album link with ?i=) gets the compact 175px player; albums & playlists get the taller one
  return (/\/song\//.test(link) || /[?&]i=\d+/.test(link)) ? 175 : 450;
}
function appleEmbedHTML(link, h){
  const src = appleEmbedUrl(link);
  return src ? `<iframe src="${src}" height="${h}" loading="lazy" allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" title="Apple Music player"></iframe>` : '';
}

function renderPlaylist(){
  const delBtn = i => EDIT ? `<button class="del-btn edit-btn" data-edit="${i}" title="Edit title / artist">✎</button><button class="del-btn" data-del="${i}" title="Remove">×</button>` : '';
  const songs = activityPosts.map((a, i)=>({a, i})).filter(x => isMusicPost(x.a));
  const items = songs.length ? songs.map(({a, i})=>{
    const link = a.link || a.meta;
    const isApple = a.label === 'Apple Music';
    const h = isApple ? appleEmbedHeight(link) : (/\/(playlist|album|show)\//.test(link) ? 152 : 80);
    const embed = isApple ? appleEmbedHTML(link, h) : spotifyEmbedHTML(link, h);
    if(embed){
      const tools = EDIT ? `<div class="tools"><button class="del-btn" data-del="${i}" title="Remove">×</button></div>` : '';
      return `<div class="sp-embed">${tools}${embed}</div>`;
    }
    return `
    <a class="activity-item spotify-card" href="${esc(link)}" target="_blank" rel="noopener">
      <div class="sp-art sp-art-empty">🎧</div>
      <div class="sp-text"><div class="sp-title">${esc(a.title || link)}</div>${a.artist ? `<div class="sp-artist">${esc(a.artist)}</div>` : ''}</div>
      ${delBtn(i)}
    </a>`;
  }).join('') : `<div class="activity-item" style="color:var(--sub);">No songs yet</div>`;
  return `
    ${EDIT ? `<div class="add-row">
      <button class="add-btn" id="addSong">+ Song</button>
      <button class="add-btn" id="addPlaylist">+ Playlist</button>
    </div>` : ''}
    <div>${items}</div>`;
}

// ---- right column: images/videos keep their real shape ----
const MEDIA_VISIBLE = 2; // how many show before the list scrolls
function mediaRatio(w, h){
  // use the file's own width/height, but clamp very tall or very wide ones so they can't dominate the card
  return Math.min(2.2, Math.max(0.7, w / h));
}
function fitMediaScroll(){
  const box = document.getElementById('mediaScroll');
  if(!box) return;
  const items = box.querySelectorAll('.activity-item');
  if(items.length <= MEDIA_VISIBLE){
    box.style.maxHeight = '';
    box.classList.remove('scrolls');
    return;
  }
  const last = items[MEDIA_VISIBLE - 1];
  box.style.maxHeight = (last.offsetTop + last.offsetHeight + 2) + 'px';
  box.classList.add('scrolls');
}
function setupMediaScroll(){
  const box = document.getElementById('mediaScroll');
  if(!box) return;
  box.querySelectorAll('.media-preview').forEach(prev=>{
    const el = prev.querySelector('img, video');
    if(!el) return;
    const apply = (w, h)=>{
      if(!w || !h) return;
      prev.style.aspectRatio = String(mediaRatio(w, h));
      fitMediaScroll();
    };
    if(el.tagName === 'IMG'){
      if(el.complete && el.naturalWidth) apply(el.naturalWidth, el.naturalHeight);
      else el.addEventListener('load', ()=> apply(el.naturalWidth, el.naturalHeight));
    } else {
      if(el.readyState >= 1 && el.videoWidth) apply(el.videoWidth, el.videoHeight);
      else el.addEventListener('loadedmetadata', ()=> apply(el.videoWidth, el.videoHeight));
    }
  });
  fitMediaScroll();
}
window.addEventListener('resize', fitMediaScroll);

function renderActivity(){
  const all = activityPosts.concat(CONFIG.activity);
  const delBtn = i => (EDIT && i < activityPosts.length) ? `<button class="del-btn" data-del="${i}" title="Remove">×</button>` : '';
  const shown = all.map((a, i)=>({a, i})).filter(x => !isMusicPost(x.a));
  const items = shown.length ? shown.map(({a, i})=>{
    if(a.data && (a.kind === 'photo' || a.kind === 'video')){
      const media = a.kind === 'photo'
        ? `<img src="${a.data}">`
        : `<video src="${a.data}" muted loop autoplay playsinline></video>`;
      return `
      <div class="activity-item media">
        <div class="media-preview">${media}${delBtn(i)}</div>
      </div>`;
    }
    return `
    <div class="activity-item${a.locked ? ' locked':''}">
      <span>${a.icon}</span><span>${a.label}</span><span class="meta">${a.meta||''}</span>${delBtn(i)}
    </div>`;
  }).join('') : `<div class="activity-item" style="color:var(--sub); border-bottom:none;">Nothing posted yet</div>`;
  return `
    ${EDIT ? `<div class="add-row">
      <button class="add-btn" id="addPhoto">+ Photo</button>
      <button class="add-btn" id="addVideo">+ Video</button>
      <input type="file" id="photoFile" accept="image/*" style="display:none;">
      <input type="file" id="videoFile" accept="video/*" style="display:none;">
    </div>` : ''}
    <div class="media-scroll" id="mediaScroll">${items}</div>`;
}

// Look up title + cover (+ artist when possible) from a Spotify link
async function fetchSpotifyInfo(link){
  const clean = link.trim().split('?')[0];
  const info = { link: clean, title: '', artist: '', thumb: '' };
  try{
    const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(clean));
    if(r.ok){
      const j = await r.json();
      info.title = j.title || '';
      info.thumb = j.thumbnail_url || '';
    }
  }catch(e){}
  // oEmbed has no artist name, so try the page's description (best effort)
  try{
    const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(clean));
    if(r.ok){
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const desc = (doc.querySelector('meta[property="og:description"]') || {}).content || '';
      const parts = desc.split('·').map(p => p.trim()).filter(Boolean)
        .filter(p => p !== info.title && !/^(Song|Single|Album|EP|Playlist|Artist)$/i.test(p) && !/^\d{4}$/.test(p) && !/likes?|saves?|monthly/i.test(p));
      if(parts.length) info.artist = parts[0];
      if(!info.title){
        info.title = ((doc.querySelector('meta[property="og:title"]') || {}).content || '');
      }
      if(!info.thumb){
        info.thumb = ((doc.querySelector('meta[property="og:image"]') || {}).content || '');
      }
    }
  }catch(e){}
  return info;
}

function addActivityPost(icon, label, meta, data, kind, extra){
  if(label === 'Spotify' || label === 'Apple Music'){
    const k = spotifyKey({label, link: (extra && extra.link) || meta});
    activityPosts = activityPosts.filter(p => !(p.label === label && spotifyKey(p) === k));
  }
  activityPosts.unshift(Object.assign({icon, label, meta, data, kind}, extra || {}));
  savePosts().then(ok => {
    if(!ok) alert('This post shows on your screen but could NOT be saved, so other people (and you after a refresh) will not see it. Check the console (F12) for the reason. Photos and videos can also be too big - try a smaller file.');
  });
  renderTab(currentTab);
  if(label === 'Spotify'){
    renderNowPlaying();
  } else {
    renderFloaters();
    spawnPostToast(icon, label);
  }
}

// Floating layer: the latest songs, photos and videos drift at random (but remembered) spots beside the panel
function renderFloaters(){
  document.querySelectorAll('.float-song, .float-media').forEach(el => el.remove());
  const panel = document.querySelector('.panel');
  if(!panel) return;
  const pr = panel.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const bandL = pr.left, bandR = vw - pr.right;
  if(Math.max(bandL, bandR) < 150) return; // screen too narrow: nothing floats

  const items = activityPosts
    .filter(p => isMusicPost(p) || (p.data && (p.kind === 'photo' || p.kind === 'video')))
    .slice(0, 8);
  let seeded = false;
  const placed = [];

  items.forEach(p=>{
    if(p.fx == null){
      p.fx = Math.random(); p.fy = Math.random();
      p.fside = Math.random() < 0.5 ? 0 : 1;
      p.frot = Math.random() * 6 - 3;
      p.fdur = 4 + Math.random() * 3;
      p.fdelay = -Math.random() * 5;
      seeded = true;
    }
    const isSong = isMusicPost(p);
    const h = p.label === 'Apple Music' ? 175 : isSong ? (/\/(playlist|album|show)\//.test(p.link || p.meta || '') ? 152 : 80) : 110;
    const bandOf = side => side === 0 ? bandL : bandR;
    const wOf = side => Math.min(isSong ? 300 : 150, bandOf(side) - 24);
    const yMax = Math.max(12, vh - h - 70);

    let spot = null;
    for(let attempt = 0; attempt < 40 && !spot; attempt++){
      const side = attempt < 20 ? p.fside : 1 - p.fside;
      const w = wOf(side);
      if(w < (isSong ? 240 : 110)) continue;
      const xMin = side === 0 ? 12 : pr.right + 12;
      const xMax = side === 0 ? bandL - w - 12 : vw - w - 12;
      if(xMax < xMin) continue;
      // fallback spots are derived from the saved seed, so the layout stays the same after a refresh
      const rx = (p.fx + attempt * 0.618034) % 1;
      const ry = (p.fy + attempt * 0.381966) % 1;
      const x = xMin + rx * (xMax - xMin);
      const y = 12 + ry * (yMax - 12);
      const clash = placed.some(r => x < r.x + r.w + 10 && x + w + 10 > r.x && y < r.y + r.h + 10 && y + h + 10 > r.y);
      if(!clash) spot = {x, y, w, h};
    }
    if(!spot) return;
    placed.push(spot);

    let el;
    if(isSong){
      el = document.createElement('div');
      el.className = 'float-song float-embed';
      const lk = p.link || p.meta;
      el.innerHTML = (p.label === 'Apple Music' ? appleEmbedHTML(lk, 175) : spotifyEmbedHTML(lk, /\/(playlist|album|show)\//.test(lk) ? 152 : 80)) ||
        `<a class="sp-fallback" href="${esc(lk)}" target="_blank" rel="noopener">🎧 ${esc(p.title || lk)}</a>`;
    } else {
      el = document.createElement('div');
      el.className = 'float-media';
      el.innerHTML = p.kind === 'photo'
        ? `<img src="${p.data}" alt="">`
        : `<video src="${p.data}" muted loop autoplay playsinline></video>`;
    }
    el.style.left = spot.x + 'px';
    el.style.top = spot.y + 'px';
    el.style.width = spot.w + 'px';
    if(!isSong) el.style.height = spot.h + 'px';
    el.style.rotate = p.frot + 'deg';
    el.style.animationDuration = p.fdur + 's';
    el.style.animationDelay = p.fdelay + 's';
    document.body.appendChild(el);
  });
  if(seeded) savePosts();
}

let floatResizeTimer = null;
window.addEventListener('resize', ()=>{
  clearTimeout(floatResizeTimer);
  floatResizeTimer = setTimeout(renderFloaters, 200);
});

// ---- background music helpers ----
let spApi = null, spController = null, spLoadedUri = null, spWantPlay = false;

function spotifyUri(link){
  const m = (link || '').match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
  return m ? 'spotify:' + m[1] + ':' + m[2] : null;
}

window.onSpotifyIframeApiReady = (IFrameAPI)=>{ spApi = IFrameAPI; renderPlayer(); };


// browsers only allow sound after a tap/click, so the first click anywhere starts the music
document.addEventListener('click', ()=>{
  spWantPlay = true;
  if(spController){ try{ spController.play(); }catch(e){} }
}, {once:true});

function renderPlayer(){
  // bottom player removed - songs play from the Playlist cards instead
  const oldBox = document.getElementById('spPlayerBox');
  if(oldBox) oldBox.remove();
  document.body.classList.remove('has-player');
  return;
}

function renderNowPlaying(){
  renderFloaters();
  renderPlayer();
  const existing = document.getElementById('nowPlaying');
  if(existing) existing.remove();
  const latest = activityPosts.find(p => p.label === 'Spotify');
  if(!latest) return;
  const el = document.createElement('a');
  el.id = 'nowPlaying';
  el.className = 'now-playing';
  el.href = latest.link || latest.meta;
  el.target = '_blank';
  el.rel = 'noopener';
  const npTitle = latest.title ? (latest.title + (latest.artist ? ' · ' + latest.artist : '')) : latest.meta;
  el.innerHTML = `<span class="np-icon">🎧</span><span class="np-text"><span class="np-label">Now playing</span><span class="np-title">${esc(npTitle)}</span></span>`;
  document.body.appendChild(el);
}

function spawnPostToast(icon, label){
  const corners = [
    {top:'16px', left:'16px'},
    {top:'16px', right:'16px'},
    {bottom:'16px', left:'16px'},
    {bottom:'16px', right:'16px'}
  ];
  const pos = corners[Math.floor(Math.random()*corners.length)];
  const el = document.createElement('div');
  el.className = 'post-toast';
  Object.assign(el.style, pos);
  el.innerHTML = `<span>${icon}</span><span>New ${label} post added</span>`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2600);
}

// Tab backgrounds are built once and preloaded, then just cross-faded when you switch tabs
const tabBgLayers = {};
function buildTabBackgrounds(){
  const colRight = document.querySelector('.col-right');
  const map = CONFIG.images.tabBackgrounds || {};
  Object.keys(map).forEach(k=>{
    const url = map[k];
    if(!url) return;
    const layer = document.createElement('div');
    layer.className = 'tab-bg';
    layer.innerHTML = isVideoUrl(url)
      ? `<video src="${esc(url)}" muted loop playsinline preload="auto"></video>`
      : `<img src="${esc(url)}" alt="">`;
    colRight.prepend(layer);
    tabBgLayers[k] = layer;
  });
}
function showTabBackground(key){
  Object.keys(tabBgLayers).forEach(k=>{
    const on = k === key;
    const layer = tabBgLayers[k];
    layer.classList.toggle('on', on);
    const v = layer.querySelector('video');
    if(v){ if(on){ const p = v.play(); if(p && p.catch) p.catch(()=>{}); } else { v.pause(); } }
  });
}

let currentTab = 'activity';
const renderers = {games:renderGames, socials:renderSocials, activity:renderActivity, playlist:renderPlaylist};
function renderTab(key){
  currentTab = key;
  const tabBody = document.getElementById('tabBody');
  showTabBackground(key);
  document.getElementById('tabBodyInner').innerHTML = renderers[key]();
  if(key === 'activity') setupMediaScroll();
  if(key === 'activity' || key === 'playlist'){
    document.querySelectorAll('.del-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.preventDefault();
        e.stopPropagation();
        if(btn.dataset.del === undefined) return;
        activityPosts.splice(Number(btn.dataset.del), 1);
        savePosts();
        renderTab(currentTab);
        renderNowPlaying();
      });
    });
    document.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.preventDefault();
        e.stopPropagation();
        const post = activityPosts[Number(btn.dataset.edit)];
        if(!post) return;
        const t = prompt('Title:', post.title || '');
        if(t === null) return;
        const a = prompt('Artist (optional):', post.artist || '');
        post.title = t.trim() || post.title;
        if(a !== null) post.artist = a.trim();
        savePosts();
        renderTab(currentTab);
        renderNowPlaying();
      });
    });
    function setupSpotifyButton(btnId, type){
      const btn = document.getElementById(btnId);
      const isPlaylist = type === 'playlist';
      btn.addEventListener('click', async ()=>{
        const link = prompt(isPlaylist ? 'Paste the Spotify or Apple Music playlist link:' : 'Paste the Spotify or Apple Music song link:');
        if(!link) return;
        if(isAppleMusicLink(link)){
          const appleOk = isPlaylist ? /\/(playlist|album)\//.test(link) : (/\/song\//.test(link) || /[?&]i=\d+/.test(link));
          if(!appleOk){
            alert(isPlaylist
              ? 'That doesn\'t look like an Apple Music playlist or album link. Use the + Song button for single songs.'
              : 'That doesn\'t look like an Apple Music song link. Use the + Playlist button for playlists and albums.');
            return;
          }
          const cleanLink = link.trim();
          addActivityPost('🎧', 'Apple Music', cleanLink, null, 'applemusic', {link: cleanLink, spType: type});
          return;
        }
        const kindOk = isPlaylist ? /\/(playlist|album)\//.test(link) : /\/track\//.test(link);
        if(!kindOk){
          alert(isPlaylist
            ? 'That doesn\'t look like a playlist link. Use the + Song button for single songs.'
            : 'That doesn\'t look like a song link. Use the + Playlist button for playlists.');
          return;
        }
        const oldText = btn.textContent;
        btn.textContent = 'Loading…';
        btn.disabled = true;
        const info = await fetchSpotifyInfo(link);
        if(isPlaylist){
          info.artist = info.artist ? 'Playlist · ' + info.artist : 'Playlist';
        } else if(!info.artist && info.title){
          const typed = prompt('Artist name (optional — couldn\'t be found automatically):', '');
          if(typed) info.artist = typed.trim();
        }
        if(!info.title){
          info.title = prompt('Couldn\'t load the info. Type the title:', '') || 'Spotify link';
        }
        info.spType = type;
        spWantPlay = true;
        addActivityPost('🎧', 'Spotify', info.link, null, 'spotify', info);
      });
    }
    if(key === 'playlist' && EDIT){
      setupSpotifyButton('addSong', 'song');
      setupSpotifyButton('addPlaylist', 'playlist');
    }
    if(key === 'activity' && EDIT){
      const photoFile = document.getElementById('photoFile');
      const videoFile = document.getElementById('videoFile');
      document.getElementById('addPhoto').addEventListener('click', ()=> photoFile.click());
      document.getElementById('addVideo').addEventListener('click', ()=> videoFile.click());
      photoFile.addEventListener('change', ()=>{
        const file = photoFile.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = ()=> addActivityPost('🖼️', 'Photo', file.name, reader.result, 'photo');
        reader.readAsDataURL(file);
      });
      videoFile.addEventListener('change', ()=>{
        const file = videoFile.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = ()=> addActivityPost('🎬', 'Video', file.name, reader.result, 'video');
        reader.readAsDataURL(file);
      });
    }
  }
}

document.getElementById('tabs').addEventListener('click', e=>{
  const btn = e.target.closest('.tab');
  if(!btn) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  renderTab(btn.dataset.tab);
});

// ---- likes / views: real shared counts (one per visitor), same database ----
const likeBtn = document.getElementById('likeBtn');
const likeN = document.getElementById('likeN');
const viewN = document.getElementById('viewN');
const statHint = document.getElementById('statHint');
let liked = false;

function paintLike(count){
  likeN.textContent = count;
  likeBtn.classList.toggle('liked', liked);
}

function localStats(){
  statHint.textContent = 'tap the heart to like — counted on this device only';
  let visits = 1;
  try{
    liked = localStorage.getItem('helloworld_liked') === 'true';
    visits = (parseInt(localStorage.getItem('helloworld_visits'), 10) || 0) + 1;
    localStorage.setItem('helloworld_visits', visits);
  }catch(e){}
  paintLike(liked ? 1 : 0);
  viewN.textContent = visits;
  likeBtn.addEventListener('click', ()=>{
    liked = !liked;
    try{ localStorage.setItem('helloworld_liked', liked); }catch(e){}
    paintLike(liked ? 1 : 0);
  });
}

async function initStats(){
  let likeDoc, viewDoc;
  if(!db || !uid){ localStats(); return; }

  async function refreshCounts(){
    const [likesQ, viewsQ] = await Promise.all([
      db.collection('likes').get(),
      db.collection('views').get()
    ]);
    viewN.textContent = viewsQ.size;
    paintLike(likesQ.size);
  }

  try{
    likeDoc = db.doc('likes/' + uid);
    viewDoc = db.doc('views/' + uid);
    liked = (await likeDoc.get()).exists;
    if(!(await viewDoc.get()).exists){ await viewDoc.set({ at: Date.now() }); }
    await refreshCounts();
  }catch(e){ console.error('stats', e); localStats(); return; }

  window.refreshStats = refreshCounts;   // used by live sync
  statHint.textContent = 'tap the heart to like — one like per visitor, synced everywhere';
  likeBtn.addEventListener('click', async ()=>{
    liked = !liked;
    paintLike(likeN.textContent);
    try{
      if(liked){ await likeDoc.set({ at: Date.now() }); } else { await likeDoc.delete(); }
    }catch(e){ liked = !liked; console.error('like', e); }
    try{ await refreshCounts(); }catch(e){ paintLike(likeN.textContent); }
  });
}

// ---- boot: connect to Firebase (firebase-db.js), load the real profile/activity/edit state,
// then render everything that depends on it ----
// add ?debug to the address (e.g. .../Angels-Reign-Karma/?debug) to see connection status on the page
const DBG = [];
function dbg(m){
  DBG.push(m); console.log('[debug]', m);
  const el = document.getElementById('dbgBox');
  if(el) el.textContent = DBG.join('\n');
}

async function boot(){
  if(/[?&]debug/.test(location.search)){
    const d = document.createElement('pre');
    d.id = 'dbgBox';
    d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:200;max-height:45vh;overflow:auto;margin:0;padding:10px;font-size:11px;white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,.92);color:#9f9;border:1px solid #393;border-radius:10px;';
    document.body.appendChild(d);
  }
  dbg('script.js version: firebase-rest v2');
  let s = { db:null, uid:null, isOwner:false };
  if(typeof FB === 'undefined'){
    dbg('ERROR: firebase-db.js did NOT load. Upload it next to index.html and check the <script src="firebase-db.js"> line.');
  } else {
    try{ s = await FB.start(); }catch(e){ dbg('ERROR in FB.start: ' + e.message); }
    FB.log.forEach(m => dbg('WARN: ' + m));
  }
  db = s.db; uid = s.uid; isOwner = s.isOwner;
  dbg('database: ' + (db ? 'connected' : 'NOT connected (local-only mode)') + ' | visitor id: ' + (uid ? uid.slice(0,6) + '...' : 'none') + ' | owner: ' + isOwner);

  if(location.hash === '#logout'){ FB.logout(); return; }
  if(db && location.hash === '#edit' && !isOwner){ FB.showLogin(); }

  if(db){
    EDIT = isOwner && location.hash !== '#view';   // #view = preview as a visitor
    try{
      const snap = await db.doc('site/profile').get();
      if(snap.exists) Object.assign(profile, snap.data());
      dbg('profile in Firebase: ' + (snap.exists ? 'yes' : 'no (using config.js text)'));
    }catch(e){ console.error('load profile', e); dbg('ERROR loading profile: ' + e.message); }
    try{
      const snap = await db.doc('site/activity').get();
      if(snap.exists && Array.isArray(snap.data().posts)) activityPosts = snap.data().posts;
      dbg('posts loaded from Firebase: ' + activityPosts.length + (snap.exists && !Array.isArray(snap.data().posts) ? ' (WARNING: posts is not a list)' : ''));
    }catch(e){ console.error('load posts', e); dbg('ERROR loading posts: ' + e.message); }
  } else {
    EDIT = localEditFallback();
    try{ Object.assign(profile, JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}); }catch(e){}
    try{ activityPosts = JSON.parse(localStorage.getItem('helloworld_activity_posts')) || []; }catch(e){ activityPosts = []; }
  }
  // one-time: push posts/profile that only exist in this browser up to Firebase (owner only)
  if(db && isOwner){
    try{
      if(!activityPosts.length){
        const local = JSON.parse(localStorage.getItem('helloworld_activity_posts')) || [];
        if(local.length){ activityPosts = local; await savePosts(); console.log('Uploaded', local.length, 'local posts to Firebase'); }
      }
      const lp = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if(lp && !(await db.doc('site/profile').get()).exists){ Object.assign(profile, lp); await saveProfile(); }
    }catch(e){ console.error('migrate', e); }
  }
  dedupeSpotify();

  renderProfile();
  buildTabBackgrounds();
  renderTab('activity');
  renderNowPlaying();
  initStats();
  startLiveSync();
}

// ---- live sync: every visitor's page updates by itself when the owner changes something ----
// Polls only the tiny site/version number every 10s; downloads the real data only if it changed.
async function startLiveSync(){
  if(!db || EDIT) return;             // the owner in edit mode keeps their own copy (no overwriting while typing)
  let lastV = null;
  try{ lastV = (await db.doc('site/version').get()).data(); }catch(e){}

  async function pull(){
    try{
      const ps = await db.doc('site/profile').get();
      if(ps.exists){
        const np = Object.assign({}, profile, ps.data());
        if(JSON.stringify(np) !== JSON.stringify(profile)){ profile = np; renderProfile(); }
      }
      const as = await db.doc('site/activity').get();
      const posts = (as.exists && Array.isArray(as.data().posts)) ? as.data().posts : [];
      if(JSON.stringify(posts) !== JSON.stringify(activityPosts)){
        activityPosts = posts;
        renderTab(currentTab);
        renderNowPlaying();
      }
      dbg('live update received');
    }catch(e){ dbg('live sync error: ' + e.message); }
  }

  async function tick(){
    if(document.hidden) return;
    try{
      const v = (await db.doc('site/version').get()).data();
      if(v !== lastV){ lastV = v; await pull(); }
      if(window.refreshStats) await window.refreshStats();
    }catch(e){}
  }
  setInterval(tick, 10000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) tick(); });
  dbg('live sync: on (checks every 10s)');
}
boot();

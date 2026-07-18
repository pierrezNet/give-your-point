let selectedCategoryId = null;
let lastPointId = null;
let isModalOpen = false;
let isTransitioning = false;

// Échappe une chaîne avant injection dans innerHTML (données utilisateur : nom d'équipe, etc.)
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Mesure cookieless de l'entonnoir : envoie un événement whitelisté au backend (fire-and-forget).
function track(event) {
    try {
        const body = JSON.stringify({ event });
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
        } else {
            fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
        }
    } catch { /* jamais bloquant */ }
}

function toggleMenu() {
    const menu = document.getElementById('mobile-menu');
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    menu.classList.toggle('hidden', isOpen);
    menu.classList.toggle('open', !isOpen);
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('mobile-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu && toggle && !menu.contains(e.target) && !toggle.contains(e.target)) {
        menu.classList.add('hidden');
        menu.classList.remove('open');
    }
});

// L'ancienne modale "À propos" est remplacée par la page /about.html
// (showAbout est conservé en redirection pour compatibilité).
function showAbout() {
    window.location.href = '/about';
}

function showHelp() {
    document.body.insertAdjacentHTML('beforeend', `
        <div id="help-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-100 p-4"
             onclick="if(event.target===this){this.remove();isModalOpen=false;}">
            <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                    <h2 class="text-xl font-black text-slate-800">${t('help.title')}</h2>
                    <button onclick="document.getElementById('help-modal').remove();isModalOpen=false;" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
                </div>
                <ol class="text-sm text-slate-600 space-y-3 list-none">
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">1.</span> ${t('help.step1')}</li>
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">2.</span> ${t('help.step2')}</li>
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">3.</span> ${t('help.step3')}</li>
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">4.</span> ${t('help.step4')}</li>
                    <li class="flex gap-3"><span class="font-black text-orange-500 shrink-0">⚠️</span> ${t('help.step5')}</li>
                </ol>
            </div>
        </div>
    `);
    isModalOpen = true;
}

function handleAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const loginId = urlParams.get('login_id');
    const loginName = urlParams.get('login_name');

    // Si on vient du lien magique, on enregistre
    if (loginId && loginName) {
        localStorage.setItem('my_user_id', loginId);
        localStorage.setItem('my_user_name', loginName);
        // On nettoie l'URL proprement
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    return localStorage.getItem('my_user_id');
}

function authHeaders() {
    const myId = localStorage.getItem('my_user_id');
    return myId ? { 'Authorization': `Bearer ${myId}` } : {};
}

async function authFetch(url, options = {}) {
    options.headers = { ...(options.headers || {}), ...authHeaders() };
    return fetch(url, options);
}

async function showProfileModal() {
    const me = await loadMe();
    if (!me) return;
    const currentEmail = me.email || '';

    document.body.insertAdjacentHTML('beforeend', `
        <div id="profile-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-100 p-4"
             onclick="if(event.target===this){this.remove();isModalOpen=false;}">
            <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                    <h2 class="text-xl font-black text-slate-800">${t('profile.title')}</h2>
                    <button onclick="document.getElementById('profile-modal').remove();isModalOpen=false;" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
                </div>
                <p class="text-sm text-slate-600 mb-4">${t('profile.desc')}</p>
                <form id="profile-form" class="space-y-3">
                    <input id="profile-email" type="email" maxlength="120"
                           value="${currentEmail.replace(/"/g, '&quot;')}"
                           placeholder="${t('profile.placeholder')}"
                           class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                    <p id="profile-error" class="text-red-600 text-xs hidden"></p>
                    <div class="flex gap-2 justify-end">
                        ${currentEmail ? `<button type="button" onclick="removeProfileEmail()" class="text-red-500 hover:text-red-700 text-sm font-bold px-3">${t('common.remove')}</button>` : ''}
                        <button type="button" onclick="document.getElementById('profile-modal').remove();isModalOpen=false;" class="text-slate-500 hover:text-slate-700 text-sm font-bold px-3">${t('common.cancel')}</button>
                        <button type="submit" class="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition">${t('common.save')}</button>
                    </div>
                </form>
            </div>
        </div>`);
    isModalOpen = true;

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProfileEmail(document.getElementById('profile-email').value.trim());
    });
}

async function saveProfileEmail(email) {
    const errEl = document.getElementById('profile-error');
    errEl.classList.add('hidden');
    const res = await authFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        errEl.textContent = err.error || t('profile.error_save');
        errEl.classList.remove('hidden');
        return;
    }
    document.getElementById('profile-modal').remove();
    isModalOpen = false;
    showToast(email ? t('profile.toast_saved') : t('profile.toast_removed'), 'success');
}

async function removeProfileEmail() {
    if (!confirm(t('profile.confirm_remove'))) return;
    await saveProfileEmail('');
}

async function loadMe() {
    const myId = localStorage.getItem('my_user_id');
    if (!myId) return null;
    try {
        const res = await authFetch('/api/me');
        if (!res.ok) return null;
        const me = await res.json();
        localStorage.setItem('my_team_id', me.team_id || '');
        localStorage.setItem('my_team_name', me.team_name || '');
        localStorage.setItem('my_role', me.role || 'member');
        return me;
    } catch {
        return null;
    }
}

async function loadCategories() {
    const catList = document.getElementById('categories-list');
    
    if (!catList) return;

    const res = await authFetch('/api/categories');
    const categories = await res.json();

    catList.innerHTML = '';
    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-card bg-white p-2 lg:p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all';
        div.draggable = true;
        div.innerHTML = `<span class="text-xl lg:text-2xl pointer-events-none">${cat.emoji}</span> <span class="text-base lg:text-2xl pointer-events-none">${cat.name}</span>`;

        div.onclick = () => selectCategory(div, String(cat.id));
        div.ondragstart = (e) => e.dataTransfer.setData('text/plain', String(cat.id));
        catList.appendChild(div);
    });
}

function renderUsers(users) {
    const usersGrid = document.getElementById('users-grid');
    if (!usersGrid) {
        return; // On sort discrètement si on n'est pas sur la page principale
    }

    // Étage 2 — « pièce vide » : équipe trop petite pour jouer (on ne peut pas s'auto-mousser).
    // On affiche un écran d'invitation pédagogique au lieu d'une grille morte.
    if ((users?.length ?? 0) < 2) {
        renderEmptyTeamState(usersGrid);
        return;
    }

    const myId = localStorage.getItem('my_user_id');
    usersGrid.innerHTML = '';

    users.forEach(user => {
        const isMe = String(user.id) === String(myId);
        const div = document.createElement('div');
        div.setAttribute('data-user-id', user.id); 
        div.style.viewTransitionName = `card-${user.id}`;
        
        // Style de la carte : si c'est moi, on grise et on désactive le curseur
        div.className = `user-card relative bg-white p-2 lg:p-3 rounded-2xl shadow-sm border-2 transition-all flex flex-col items-center text-center
            ${isMe ? 'cursor-not-allowed border-slate-200 hover:bg-red-50' : 'cursor-pointer hover:shadow-md border-transparent'}`;
        
        div.innerHTML = `
            <button onclick="showHistory(event, '${user.id}', '${user.name}')" 
                    class="absolute top-3 left-3 text-slate-300 hover:text-blue-500 hover:scale-110 transition-all z-30 p-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>
            <div class="rank-badge absolute top-3 right-3 text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm"></div>
            <div class="collapse lg:visible w-16 h-16 bg-linear-to-br from-blue-100 to-blue-50 rounded-full mb-3 flex items-center justify-center text-blue-600 text-2xl font-bold border border-blue-100 shadow-inner">
                ${(user.name || "U")[0].toUpperCase()}
            </div>
            <h3 class="font-bold text-gray-800 text-lg">${user.name} ${isMe ? t('index.you_label') : ''}</h3>
            <p class="user-points-total text-blue-600 font-black text-sm mb-3"></p>
            <div class="top-categories-container flex gap-2 mt-2"></div>
        `;

        if (isMe) {
            // Ma carte : feedback visuel + message si on essaie quand même
            div.ondragover = (e) => { e.preventDefault(); div.classList.add('border-red-400', 'bg-red-50'); };
            div.ondragleave = () => div.classList.remove('border-red-400', 'bg-red-50');
            div.ondrop = (e) => {
                e.preventDefault();
                div.classList.remove('border-red-400', 'bg-red-50');
                if (e.dataTransfer.getData('text/plain')) {
                    showToast(t('toast.self_forbidden'), 'error');
                    selectedCategoryId = null;
                    clearSelection();
                }
            };
            div.onclick = () => {
                if (selectedCategoryId) {
                    showToast(t('toast.self_forbidden'), 'error');
                    selectedCategoryId = null;
                    clearSelection();
                }
            };
        } else {
            div.ondragover = (e) => { e.preventDefault(); div.classList.add('border-blue-400', 'bg-blue-50'); };
            div.ondragleave = () => div.classList.remove('border-blue-400', 'bg-blue-50');
            div.ondrop = async (e) => {
                e.preventDefault();
                div.classList.remove('border-blue-400', 'bg-blue-50');
                const catId = e.dataTransfer.getData('text/plain');
                if (catId) addPoint(user.id, div, catId);
            };
            div.onclick = () => {
                if (selectedCategoryId) addPoint(user.id, div, selectedCategoryId);
            };
        }

        usersGrid.appendChild(div);
        updateCardUI(div, user); 
    });
}

// Étage 2 — écran d'invitation affiché quand l'équipe est trop petite pour jouer.
async function renderEmptyTeamState(container) {
    // Idempotent : ne pas re-render (le SSE tique toutes les 10 s) pour ne pas effacer une saisie.
    if (document.getElementById('empty-team-state')) return;

    const isWelcome = localStorage.getItem('dtp_welcome') === '1';
    localStorage.removeItem('dtp_welcome');
    const role = localStorage.getItem('my_role') || 'member';
    const canInvite = ['admin', 'superadmin', 'owner'].includes(role);

    const title = isWelcome ? t('empty.welcome_title') : t('empty.title');

    container.innerHTML = `
        <div id="empty-team-state" class="col-span-full bg-white rounded-3xl border-2 border-dashed border-blue-200 p-8 md:p-12 text-center">
            <div class="text-6xl mb-4">${isWelcome ? '🎉' : '👋'}</div>
            <h3 class="text-2xl font-black text-slate-800">${title}</h3>
            <p class="text-slate-600 mt-2 max-w-md mx-auto">${canInvite ? t('empty.desc') : t('empty.wait_desc')}</p>
            ${canInvite ? `
            <div class="mt-6 max-w-md mx-auto space-y-3 text-left">
                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="empty-invite-link" type="text" readonly value="${t('empty.loading_link')}" onclick="this.select()"
                           class="flex-1 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm outline-none">
                    <button onclick="copyEmptyInvite()" class="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold hover:bg-slate-900 transition whitespace-nowrap">${t('empty.copy')}</button>
                </div>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="empty-invite-email" type="email" placeholder="${t('empty.email_placeholder')}"
                           class="flex-1 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500">
                    <button onclick="sendEmptyInvite()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 transition whitespace-nowrap">${t('empty.send')}</button>
                </div>
                <p id="empty-invite-msg" class="text-xs hidden"></p>
            </div>` : ''}
        </div>`;

    if (canInvite) {
        try {
            const res = await authFetch('/api/team-invite');
            if (res.ok) {
                const data = await res.json();
                const input = document.getElementById('empty-invite-link');
                if (input) input.value = data.url;
            }
        } catch { /* le lien reste sur "chargement" ; l'admin peut aussi passer par /admin */ }
    }
}

function copyEmptyInvite() {
    const input = document.getElementById('empty-invite-link');
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value);
    input.select();
    const msg = document.getElementById('empty-invite-msg');
    if (msg) { msg.textContent = t('empty.link_copied'); msg.className = 'text-xs text-emerald-600'; }
}

async function sendEmptyInvite() {
    const emailInput = document.getElementById('empty-invite-email');
    const msg = document.getElementById('empty-invite-msg');
    const email = (emailInput?.value || '').trim();
    if (!email) return;
    const res = await authFetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
    if (res.ok) {
        emailInput.value = '';
        if (msg) { msg.textContent = t('empty.email_sent'); msg.className = 'text-xs text-emerald-600'; }
    } else {
        if (msg) { msg.textContent = t('empty.email_error'); msg.className = 'text-xs text-red-600'; }
    }
}

function updateCardUI(card, user) {
    card.querySelector('.user-points-total').innerText = `${user.total_points || 0} ${t('index.pts_short')}`;
    
    const rankBadge = card.querySelector('.rank-badge');
    rankBadge.innerText = `#${user.rank}`;
    const rankColor = user.rank === 1 ? 'bg-yellow-400' : (user.rank === 2 ? 'bg-slate-300' : (user.rank === 3 ? 'bg-amber-600' : 'bg-blue-500'));
    rankBadge.className = `rank-badge absolute top-3 right-3 ${rankColor} text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm`;

    const catContainer = card.querySelector('.top-categories-container');
    catContainer.innerHTML = (user.topCategories || []).map(cat => `
        <div class="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
            <span class="text-sm">${cat.emoji}</span>
            <span class="text-[10px] font-bold ml-1 text-gray-500">${cat.count}</span>
        </div>`).join('') || `<span class="text-[10px] text-gray-400 italic">${t('index.no_badge')}</span>`;

    // Gestion du gage
    const banner = card.querySelector('.gage-banner');
    if (user.gage) {
        card.classList.add('gage-active', 'border-orange-500');
        if (!banner) {
            const b = document.createElement('div');
            b.className = 'gage-banner absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg z-10 whitespace-nowrap';
            card.appendChild(b);
        }
        card.querySelector('.gage-banner').innerText = t('index.gage_label', { dare: user.gage.toUpperCase() });
    } else {
        card.classList.remove('gage-active', 'border-orange-500');
        if (banner) banner.remove();
    }
}

function selectCategory(el, id) {
    const isMobile = window.innerWidth < 768; // Détection standard (tablette/mobile)
    const emoji = el.querySelector('span').innerText;

    if (isMobile) {
        // --- COMPORTEMENT MOBILE ---
        // On ouvre directement le sélecteur central
        openUserSelector(id, emoji);
    } else {
        // --- COMPORTEMENT DESKTOP ---
        // On garde ton ancienne logique de sélection visuelle
        const isAlreadySelected = el.classList.contains('ring-blue-500');
        document.querySelectorAll('.category-card').forEach(c => 
            c.classList.remove('ring-4', 'ring-blue-500', 'category-active')
        );
        
        if (!isAlreadySelected) {
            selectedCategoryId = id;
            el.classList.add('ring-4', 'ring-blue-500', 'category-active');
        } else {
            selectedCategoryId = null;
        }
    }
}

async function openUserSelector(catId, emoji) {
    const res = await authFetch('/api/users-stats');
    const users = await res.json();
    const myId = localStorage.getItem('my_user_id');

    const overlay = document.createElement('div');
    overlay.id = 'wheel-selector';
    overlay.className = "fixed inset-0 bg-slate-900/85 z-[300] flex items-center justify-center p-4";
    
    // On filtre pour ne pas s'auto-mousser
    const otherUsers = users.filter(u => String(u.id) !== String(myId));

    isModalOpen = true;

    overlay.innerHTML = `
        <div class="bg-white rounded-[40px] w-full max-w-sm p-6 animate-pop shadow-2xl text-center">
            <div class="mb-6">
                <div class="text-5xl mb-2">${emoji}</div>
                <p class="text-slate-500 text-sm font-medium">${t('selector.who')}</p>
            </div>
            
            <div class="grid grid-cols-3 gap-4 mb-6">
                ${otherUsers.map(u => `
                    <button onclick="sendPointAndClose('${u.id}', '${catId}')" 
                            class="flex flex-col items-center gap-2 group">
                        <div class="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl group-active:bg-blue-600 group-active:text-white transition-all shadow-sm">
                            ${u.name[0].toUpperCase()}
                        </div>
                        <span class="text-[10px] font-bold text-slate-600 truncate w-full">${u.name}</span>
                    </button>
                `).join('')}
            </div>

            <button onclick="document.getElementById('wheel-selector').remove(); isModalOpen = false;"
                    class="text-slate-400 font-bold text-xs uppercase tracking-widest py-2">
                ${t('common.cancel')}
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// Fonction de pont pour envoyer et fermer
window.sendPointAndClose = async (userId, catId) => {
    const selector = document.getElementById('wheel-selector');
    const modalContent = selector.querySelector('.bg-white'); // La boîte blanche

    modalContent.classList.add('animate-out-pop');

    await new Promise(resolve => setTimeout(resolve, 200));

    selector.remove();
    isModalOpen = false;

    requestAnimationFrame(async () => {
        const cardMock = document.createElement('div');
        await addPoint(userId, cardMock, catId);
    });
};

function clearSelection() {
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('ring-4', 'ring-blue-500', 'category-active'));
}

async function addPoint(userId, cardEl, catId) {
    try {
        const res = await authFetch('/api/points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to_user_id: String(userId), category_id: String(catId) })
        });

        if (res.ok) {
            const data = await res.json();
            selectedCategoryId = null;
            clearSelection();
            if (document.activeElement) document.activeElement.blur();

            cardEl.classList.add('ring-4', 'ring-green-500');
            if (data.gageTriggered) {
                showToast(t('toast.gage_triggered', { name: data.gageTriggered.name, dare: data.gageTriggered.dare }), 'danger');
            } else if (data.gageWarning) {
                showToast(t('toast.gage_warning', { name: data.gageWarning.name }), 'warning');
            } else {
                showToast(t('toast.point_sent'), 'success');
            }
            await updateAllData();

            setTimeout(() => {
                cardEl.classList.remove('ring-4', 'ring-green-500');
            }, 500);
        } else {
            const errorData = await res.json();
            showToast(errorData.error || t('toast.generic_error'), "bg-orange-500");
            selectedCategoryId = null;
            clearSelection();
        }
    } catch (e) {
        console.error("Erreur réseau :", e);
        showToast(t('toast.server_unreachable'), "bg-red-600");
    }
}

function showToast(message, type = 'success') {
    const oldToast = document.getElementById('toast-notification');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';

    const styles = {
        success: { bg: 'bg-slate-800',  duration: 5000 },
        error:   { bg: 'bg-orange-600', duration: 5000 },
        warning: { bg: 'bg-amber-500',  duration: 6000 },
        danger:  { bg: 'bg-rose-600',   duration: 8000 },
    };
    const { bg, duration } = styles[type] ?? styles.error;

    const undoButton = (type === 'success' || type === 'warning' || type === 'danger')
        ? `<button onclick="undoLastPoint()" class="text-yellow-200 font-black uppercase text-xs hover:text-white transition-colors shrink-0">${t('toast.undo')}</button>`
        : '';

    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 ${bg} text-white px-6 py-3 rounded-full shadow-2xl z-[200] flex items-center gap-4 animate-in slide-in-from-bottom-10 max-w-[90vw]`;
    toast.innerHTML = `<span class="text-sm font-medium">${message}</span>${undoButton}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.isConnected) {
            toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-10');
            setTimeout(() => toast.remove(), 1000);
        }
    }, duration);
}

async function updateAllData() {
    try {
        const statsRes = await authFetch('/api/users-stats');
        if (!statsRes.ok) throw new Error(`Erreur Serveur: Stats(${statsRes.status})`);
        const users = await statsRes.json();

        if (document.startViewTransition) {
            isTransitioning = true;
            const t = document.startViewTransition(() => {
                renderUsers(users);
                renderLeaderboardUI(users);
            });
            t.finished.catch(() => {
                renderUsers(users);
                renderLeaderboardUI(users);
            }).finally(() => { isTransitioning = false; });
        } else {
            renderUsers(users);
            renderLeaderboardUI(users);
        }
    } catch (err) {
        console.error("Erreur lors de la mise à jour :", err);
    }
}

function renderLeaderboardUI(data) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;
    
    container.innerHTML = data.map((u, i) => `
        <div class="flex items-center justify-between p-3 ${i === 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'} rounded-lg">
            <div class="flex items-center gap-4">
                <span class="text-lg font-bold w-6 text-gray-400">#${i + 1}</span>
                <span class="font-semibold text-gray-800">${u.name}</span>
            </div>
            <span class="text-xl font-black text-blue-600">${u.total_points || 0} <small class="text-[10px] text-gray-400">PTS</small></span>
        </div>`).join('');
}

async function showHistory(event, userId, userName) {
    // Crucial : on empêche le clic d'activer la carte en dessous
    event.stopPropagation();
    
    try {
        const res = await authFetch(`/api/users/${userId}/history`);
        if (!res.ok) throw new Error("Impossible de charger l'historique");
        
        const data = await res.json();

        // Fonction interne pour un formatage de date propre
        function formatSmartDate(dateIso) {
            const date = new Date(dateIso);
            const now = new Date();
            const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
            const locale = getLang() === 'en' ? 'en-US' : 'fr-FR';
            const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

            if (diffInDays === 0 && date.getDate() === now.getDate()) {
                return t('date.today_at', { time });
            } else if (diffInDays === 1 || (diffInDays === 0 && date.getDate() !== now.getDate())) {
                return t('date.yesterday_at', { time });
            } else {
                const dayMonth = date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
                return t('date.day_month_at', { date: dayMonth, time });
            }
        }

        isModalOpen = true;

        const historyHtml = `
            <div id="history-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-100 p-4"
                 onclick="if(event.target === this) { this.remove(); isModalOpen = false; }">
                <div class="bg-white rounded-3xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div class="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h2 class="text-xl font-black text-slate-800">${t('history.title', { name: userName })}</h2>
                        <button onclick="document.getElementById('history-modal').remove(); isModalOpen = false;" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
                    </div>

                    <h3 class="font-black text-[10px] uppercase tracking-widest text-blue-500 mb-4 flex items-center gap-2">
                        <span class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span> ${t('history.received')}
                    </h3>
                    <div class="space-y-3 mb-8">
                        ${data.received.length > 0 ? data.received.map(p => `
                            <div class="flex items-center justify-between text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <span class="text-slate-700">${p.emoji} <b>${p.cat_name}</b> <span class="text-slate-400 text-xs">${t('history.received_from')}</span> ${p.from_name}</span>
                                <span class="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md shadow-sm">${formatSmartDate(p.created_at)}</span>
                            </div>
                        `).join('') : `<p class="text-xs italic text-slate-400 py-2 text-center">${t('history.empty_received')}</p>`}
                    </div>

                    <h3 class="font-black text-[10px] uppercase tracking-widest text-emerald-500 mb-4 flex items-center gap-2">
                        <span class="w-2 h-2 bg-emerald-500 rounded-full"></span> ${t('history.given')}
                    </h3>
                    <div class="space-y-3">
                        ${data.given.length > 0 ? data.given.map(p => `
                            <div class="flex items-center justify-between text-sm bg-emerald-50/30 p-3 rounded-xl border border-emerald-100">
                                <span class="text-slate-700">${t('history.gave')} ${p.emoji} <b>${p.cat_name}</b> <span class="text-slate-400 text-xs">${t('history.given_to')}</span> ${p.to_name}</span>
                                <span class="text-[10px] font-bold text-emerald-600/50 bg-white px-2 py-1 rounded-md shadow-sm">${formatSmartDate(p.created_at)}</span>
                            </div>
                        `).join('') : `<p class="text-xs italic text-slate-400 py-2 text-center">${t('history.empty_given')}</p>`}
                    </div>

                    ${data.dares && data.dares.length > 0 ? `
                    <h3 class="font-black text-[10px] uppercase tracking-widest text-orange-500 mb-4 mt-8 flex items-center gap-2">
                        <span class="w-2 h-2 bg-orange-500 rounded-full"></span> ${t('history.dares')}
                    </h3>
                    <div class="space-y-3">
                        ${data.dares.map(d => `
                            <div class="flex items-center justify-between text-sm bg-orange-50 p-3 rounded-xl border border-orange-100">
                                <span class="text-slate-700">${d.emoji} <b>${d.dare_text}</b></span>
                                <span class="text-[10px] font-bold text-orange-400 bg-white px-2 py-1 rounded-md shadow-sm">${formatSmartDate(d.cleared_at)}</span>
                            </div>
                        `).join('')}
                    </div>` : ''}
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', historyHtml);
    } catch (err) {
        console.error(err);
        alert(t('history.error'));
    }
}

async function undoLastPoint() {
    const res = await authFetch('/api/points/undo', {
        method: 'POST'
    });

    if (res.ok) {
        const toast = document.getElementById('toast-notification');
        if (toast) toast.remove();
        // On rafraîchit les scores
        await updateAllData();
    }
}

async function init() {
    // Lien d'invitation /join/<code> : écran d'auto-inscription (prioritaire sur l'auth).
    const joinMatch = window.location.pathname.match(/^\/join\/([^\/]+)$/);
    if (joinMatch) {
        await renderJoin(decodeURIComponent(joinMatch[1]));
        return;
    }

    const myId = handleAuth();

    if (!myId) {
        await renderLanding();
        return;
    }

    const me = await loadMe();
    if (!me) {
        localStorage.removeItem('my_user_id');
        localStorage.removeItem('my_user_name');
        document.body.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
                <h1 class="text-2xl font-bold text-gray-800">${t('auth.session_invalid_title')}</h1>
                <p class="text-gray-600 mt-2">${t('auth.session_invalid_msg')}</p>
            </div>`;
        return;
    }

    const nameEl = document.getElementById('current-user-name');
    const avatarEl = document.getElementById('current-user-avatar');
    if (nameEl) {
        nameEl.innerText = me.name;
        if (avatarEl) avatarEl.innerText = (me.name || '?')[0].toUpperCase();
    }

    const teamEl = document.getElementById('current-team-name');
    if (teamEl) teamEl.innerText = me.team_name || '';

    // Visibilité conditionnelle des liens admin / superadmin / owner
    const isAdmin = me.role === 'admin' || me.role === 'superadmin' || me.role === 'owner';
    const isSuperadmin = me.role === 'superadmin' || me.role === 'owner';
    const isOwner = me.role === 'owner';
    if (!isAdmin) {
        document.querySelectorAll('.nav-btn-admin').forEach(el => el.style.display = 'none');
    }
    if (isSuperadmin) {
        document.querySelectorAll('.nav-btn-superadmin').forEach(el => el.style.display = '');
    }
    if (isOwner) {
        document.querySelectorAll('.nav-btn-owner').forEach(el => el.style.display = '');
    }

    await Promise.all([
        loadCategories(),
        updateAllData()
    ]);
    startEventSource();
    initPushNotifications(); // fire-and-forget
}

function mockupSvg() {
    return `
    <svg viewBox="0 0 320 360" xmlns="http://www.w3.org/2000/svg" class="w-72 md:w-80 drop-shadow-2xl" role="img" aria-label="${t('landing.mockup_alt')}">
        <!-- Carte principale -->
        <rect x="10" y="10" width="300" height="340" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <!-- Tag rang en haut à droite -->
        <rect x="240" y="30" width="50" height="22" rx="8" fill="#facc15"/>
        <text x="265" y="46" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="900" fill="#1e293b">${t('landing.mockup_user_rank')}</text>
        <!-- Tag démo -->
        <rect x="30" y="30" width="56" height="22" rx="8" fill="#dbeafe"/>
        <text x="58" y="46" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#2563eb">${t('landing.mockup_demo_label')}</text>
        <!-- Avatar circulaire -->
        <circle cx="160" cy="115" r="42" fill="url(#avatarGrad)" stroke="#bfdbfe" stroke-width="2"/>
        <text x="160" y="128" text-anchor="middle" font-family="system-ui, sans-serif" font-size="36" font-weight="900" fill="#2563eb">A</text>
        <!-- Nom -->
        <text x="160" y="190" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="800" fill="#1e293b">${t('landing.mockup_user_name')}</text>
        <!-- Points -->
        <text x="160" y="216" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="900" fill="#2563eb">${t('landing.mockup_user_pts')}</text>
        <!-- Badges (mini cartes) -->
        <g transform="translate(50, 250)">
            <rect width="60" height="34" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
            <text x="30" y="22" text-anchor="middle" font-size="18">😂</text>
            <text x="48" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="#64748b">5</text>
        </g>
        <g transform="translate(130, 250)">
            <rect width="60" height="34" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
            <text x="30" y="22" text-anchor="middle" font-size="18">👿</text>
            <text x="48" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="#64748b">4</text>
        </g>
        <g transform="translate(210, 250)">
            <rect width="60" height="34" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
            <text x="30" y="22" text-anchor="middle" font-size="18">😴</text>
            <text x="48" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="#64748b">3</text>
        </g>
        <!-- Bannière gage -->
        <g transform="translate(40, 305)">
            <rect width="240" height="30" rx="15" fill="#ea580c"/>
            <text x="120" y="20" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="900" fill="white">🚨 GAGE : VIENNOISERIES</text>
        </g>
        <defs>
            <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#dbeafe"/>
                <stop offset="100%" stop-color="#eff6ff"/>
            </linearGradient>
        </defs>
    </svg>`;
}

async function renderLanding() {
    let cfg = {};
    try {
        const res = await fetch('/api/config');
        if (res.ok) cfg = await res.json();
    } catch {}

    document.body.innerHTML = `
        <div class="min-h-screen bg-gray-100">
            <!-- Header sticky -->
            <header class="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
                <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">🎯</span>
                        <span class="font-black text-slate-800">${t('app.title')}</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs font-bold text-slate-500">
                        <button data-lang-toggle="fr" onclick="setLang('fr')" class="px-1">FR</button>
                        <span class="text-slate-300">|</span>
                        <button data-lang-toggle="en" onclick="setLang('en')" class="px-1">EN</button>
                    </div>
                </div>
            </header>

            <!-- Hero -->
            <section class="max-w-5xl mx-auto px-4 pt-12 pb-8 grid md:grid-cols-2 gap-10 items-center">
                <div>
                    <h1 class="text-4xl md:text-5xl font-black text-slate-800 leading-tight">${t('app.title')} 🎯</h1>
                    <p class="text-lg text-slate-600 mt-4">${t('landing.hero_pitch')}</p>
                    <div class="mt-6 flex flex-wrap items-center gap-4">
                        <a href="#create" class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-blue-600/20">${t('landing.cta_create')}</a>
                        <a href="#have-link" class="text-sm font-bold text-blue-600 hover:underline">${t('landing.have_link_link')}</a>
                    </div>
                </div>
                <div class="flex justify-center md:justify-end">
                    ${mockupSvg()}
                </div>
            </section>

            <!-- Comment ça marche -->
            <section class="max-w-5xl mx-auto px-4 py-12">
                <h2 class="text-2xl font-black text-slate-800 mb-8 text-center">${t('landing.how_title')}</h2>
                <div class="grid md:grid-cols-3 gap-6">
                    <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div class="text-3xl mb-2">🎁</div>
                        <h3 class="font-bold text-slate-800 mb-1">${t('landing.how_step1_title')}</h3>
                        <p class="text-sm text-slate-600">${t('landing.how_step1_desc')}</p>
                    </div>
                    <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div class="text-3xl mb-2">📈</div>
                        <h3 class="font-bold text-slate-800 mb-1">${t('landing.how_step2_title')}</h3>
                        <p class="text-sm text-slate-600">${t('landing.how_step2_desc')}</p>
                    </div>
                    <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div class="text-3xl mb-2">⚠️</div>
                        <h3 class="font-bold text-slate-800 mb-1">${t('landing.how_step3_title')}</h3>
                        <p class="text-sm text-slate-600">${t('landing.how_step3_desc')}</p>
                    </div>
                </div>
            </section>

            <!-- Pour qui -->
            <section class="max-w-5xl mx-auto px-4 py-12">
                <h2 class="text-2xl font-black text-slate-800 mb-8 text-center">${t('landing.who_title')}</h2>
                <div class="grid md:grid-cols-3 gap-6">
                    <div class="bg-blue-50 rounded-2xl p-6 border border-blue-100">
                        <h3 class="font-bold text-slate-800 mb-2">${t('landing.who_team_title')}</h3>
                        <p class="text-sm text-slate-600">${t('landing.who_team_desc')}</p>
                    </div>
                    <div class="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
                        <h3 class="font-bold text-slate-800 mb-2">${t('landing.who_class_title')}</h3>
                        <p class="text-sm text-slate-600">${t('landing.who_class_desc')}</p>
                    </div>
                    <div class="bg-amber-50 rounded-2xl p-6 border border-amber-100">
                        <h3 class="font-bold text-slate-800 mb-2">${t('landing.who_friends_title')}</h3>
                        <p class="text-sm text-slate-600">${t('landing.who_friends_desc')}</p>
                    </div>
                </div>
            </section>

            <!-- Formulaire d'inscription (ancre #create) -->
            <section id="create" class="max-w-md mx-auto px-4 py-12">
                <div class="bg-white rounded-3xl shadow-xl p-8 space-y-5 border border-slate-200">
                    <div class="text-center">
                        <h2 class="text-2xl font-black text-slate-800">${t('landing.create_title')}</h2>
                        <p class="text-sm text-slate-500 mt-2">${t('landing.create_subtitle')}</p>
                    </div>
                    <form id="onboarding-form" class="space-y-3">
                        <input id="ob-company" type="text" required minlength="2" maxlength="60" placeholder="${t('onboarding.company_placeholder')}" class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                        <input id="ob-admin" type="text" required minlength="1" maxlength="40" placeholder="${t('onboarding.admin_placeholder')}" class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                        <input id="ob-email" type="email" maxlength="120" placeholder="${t('onboarding.email_placeholder')}" class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                        <div class="cf-turnstile" data-sitekey="${cfg.turnstileSiteKey || ''}" data-size="flexible"></div>
                        <button type="submit" id="ob-submit" class="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">${t('onboarding.submit')}</button>
                        <p id="ob-error" class="text-red-600 text-xs text-center hidden"></p>
                    </form>
                    <p class="text-[10px] text-slate-400 text-center">${t('landing.legal_note')}</p>
                </div>
            </section>

            <!-- Bloc lien magique (ancre #have-link) -->
            <section id="have-link" class="max-w-md mx-auto px-4 pb-12">
                <div class="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 border border-slate-200">
                    <h3 class="font-bold text-slate-800 mb-1">${t('onboarding.have_link_title')}</h3>
                    <p class="text-xs text-slate-600">${t('onboarding.have_link_desc')}</p>
                </div>
            </section>

            <!-- FAQ -->
            <section class="max-w-3xl mx-auto px-4 py-12">
                <h2 class="text-2xl font-black text-slate-800 mb-6 text-center">${t('landing.faq_title')}</h2>
                <div class="space-y-3">
                    <details class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm group">
                        <summary class="font-bold text-slate-800 cursor-pointer marker:text-blue-500">${t('landing.faq_free_q')}</summary>
                        <p class="text-sm text-slate-600 mt-3">${t('landing.faq_free_a')}</p>
                    </details>
                    <details class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm group">
                        <summary class="font-bold text-slate-800 cursor-pointer marker:text-blue-500">${t('landing.faq_data_q')}</summary>
                        <p class="text-sm text-slate-600 mt-3">${t('landing.faq_data_a')}</p>
                    </details>
                    <details class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm group">
                        <summary class="font-bold text-slate-800 cursor-pointer marker:text-blue-500">${t('landing.faq_account_q')}</summary>
                        <p class="text-sm text-slate-600 mt-3">${t('landing.faq_account_a')}</p>
                    </details>
                </div>
            </section>

            <footer class="max-w-5xl mx-auto px-4 py-8 text-center text-xs text-slate-400 border-t border-slate-200">
                Made with ❤️ — ${t('app.title')}
            </footer>
        </div>`;
    applyI18n();
    track('landing_vue');

    if (cfg.turnstileSiteKey && !document.querySelector('script[src*="turnstile"]')) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
    }

    document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        track('onboarding_soumis');
        const errEl = document.getElementById('ob-error');
        const submitBtn = document.getElementById('ob-submit');
        errEl.classList.add('hidden');

        const company = document.getElementById('ob-company').value.trim();
        const admin = document.getElementById('ob-admin').value.trim();
        const adminEmail = document.getElementById('ob-email').value.trim();
        const ts = document.querySelector('[name="cf-turnstile-response"]')?.value || '';

        if (!ts) {
            errEl.textContent = t('onboarding.error_turnstile_pending');
            errEl.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = t('onboarding.submit_loading');

        try {
            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_name: company, admin_name: admin, admin_email: adminEmail, locale: getLang(), turnstile_token: ts })
            });

            if (res.ok) {
                const data = await res.json();
                // Étage 2 : signale à l'app d'afficher l'accueil "invite ton équipe"
                localStorage.setItem('dtp_welcome', '1');
                window.location.href = `/login/${data.token}`;
                return;
            }
            const err = await res.json().catch(() => ({}));
            errEl.textContent = err.error || t('onboarding.error_generic');
            errEl.classList.remove('hidden');
        } catch {
            errEl.textContent = t('onboarding.error_server');
            errEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = t('onboarding.submit');
        }
    });
}

// Écran d'auto-inscription atteint via un lien d'invitation /join/<code>
async function renderJoin(code) {
    let info = null;
    try {
        const res = await fetch(`/api/join/${encodeURIComponent(code)}`);
        if (res.ok) info = await res.json();
    } catch {}
    track('join_vue');

    if (!info) {
        document.body.innerHTML = `
            <div class="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 text-center">
                <div class="text-5xl mb-4">🔗</div>
                <h1 class="text-2xl font-black text-slate-800">${t('join.invalid_title')}</h1>
                <p class="text-slate-600 mt-2 max-w-sm">${t('join.invalid_msg')}</p>
                <a href="/" class="mt-6 inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition">${t('join.back_home')}</a>
            </div>`;
        applyI18n();
        return;
    }

    const teamName = escapeHtml(info.team_name);
    const companyName = escapeHtml(info.company_name);

    document.body.innerHTML = `
        <div class="min-h-screen bg-gray-100">
            <header class="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
                <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">🎯</span>
                        <span class="font-black text-slate-800">${t('app.title')}</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs font-bold text-slate-500">
                        <button data-lang-toggle="fr" onclick="setLang('fr')" class="px-1">FR</button>
                        <span class="text-slate-300">|</span>
                        <button data-lang-toggle="en" onclick="setLang('en')" class="px-1">EN</button>
                    </div>
                </div>
            </header>
            <section class="max-w-md mx-auto px-4 py-16">
                <div class="bg-white rounded-3xl shadow-xl p-8 space-y-5 border border-slate-200 text-center">
                    <div class="text-5xl">🎉</div>
                    <div>
                        <h1 class="text-2xl font-black text-slate-800">${t('join.heading', { team: teamName })}</h1>
                        <p class="text-sm text-slate-500 mt-2">${t('join.subtitle', { company: companyName })}</p>
                    </div>
                    <form id="join-form" class="space-y-3 text-left">
                        <input id="join-name" type="text" required minlength="1" maxlength="40"
                               placeholder="${t('join.name_placeholder')}"
                               class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                        <button type="submit" id="join-submit"
                                class="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">${t('join.submit')}</button>
                        <p id="join-error" class="text-red-600 text-xs text-center hidden"></p>
                    </form>
                    <a href="/" class="text-xs font-bold text-slate-400 hover:underline block">${t('join.have_account')}</a>
                </div>
            </section>
        </div>`;
    applyI18n();

    document.getElementById('join-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('join-error');
        const submitBtn = document.getElementById('join-submit');
        errEl.classList.add('hidden');
        const name = document.getElementById('join-name').value.trim();
        if (!name) return;

        submitBtn.disabled = true;
        submitBtn.textContent = t('join.submit_loading');
        try {
            const res = await fetch('/api/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name }),
            });
            if (res.ok) {
                const data = await res.json();
                track('join_soumis');
                window.location.href = `/login/${data.token}`;
                return;
            }
            const err = await res.json().catch(() => ({}));
            errEl.textContent = err.error || t('join.error_generic');
            errEl.classList.remove('hidden');
        } catch {
            errEl.textContent = t('join.error_generic');
            errEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = t('join.submit');
        }
    });
}

function startEventSource() {
    const myId = localStorage.getItem('my_user_id');
    if (!myId) return;
    const source = new EventSource(`/api/events?t=${encodeURIComponent(myId)}`);

    source.addEventListener('stats', (e) => {
        if (isModalOpen || isTransitioning) return;
        const users = JSON.parse(e.data);
        renderUsers(users);
        renderLeaderboardUI(users);
    });

    source.onerror = () => {
        source.close();
        setTimeout(startEventSource, 5000);
    };
}

// === Push Notifications ===

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function registerPushSubscription(subscription) {
    const myId = localStorage.getItem('my_user_id');
    if (!myId) return;
    await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${myId}` },
        body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.toJSON().keys }),
    });
}

async function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js');

        const vapidRes = await fetch('/api/push/vapid-key');
        if (!vapidRes.ok) return;
        const { publicKey } = await vapidRes.json();
        if (!publicKey) return; // VAPID non configuré (local dev)

        // Si déjà abonné, re-synchroniser avec le serveur
        const existing = await reg.pushManager.getSubscription();
        if (existing) { await registerPushSubscription(existing); return; }

        // Demander la permission après 3 secondes pour ne pas être intrusif
        setTimeout(async () => {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            await registerPushSubscription(subscription);
        }, 3000);
    } catch (e) {
        console.log('Push non disponible:', e.message);
    }
}

// Lancement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
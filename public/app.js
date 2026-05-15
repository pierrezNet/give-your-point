let selectedCategoryId = null;
let lastPointId = null;
let isModalOpen = false;
let isTransitioning = false;

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

function showAbout() {
    document.body.insertAdjacentHTML('beforeend', `
        <div id="about-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-100 p-4"
             onclick="if(event.target===this){this.remove();isModalOpen=false;}">
            <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                    <h2 class="text-xl font-black text-slate-800">À propos 🎯</h2>
                    <button onclick="document.getElementById('about-modal').remove();isModalOpen=false;" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
                </div>
                <p class="text-sm text-slate-600 mb-3">
                    <b>Donne Ton Point</b> est un outil de gamification interne pour célébrer (et taquiner) les comportements de l'équipe.
                </p>
                <p class="text-sm text-slate-600 mb-3">
                    Chaque collègue peut offrir des badges dans différentes catégories. Quand un seuil est atteint… un gage s'impose !
                </p>
                <p class="text-xs text-slate-400 mt-4 italic">Fait avec ❤️ pour l'équipe par Emmanuel et Claude.</p>
            </div>
        </div>
    `);
    isModalOpen = true;
}

function showHelp() {
    document.body.insertAdjacentHTML('beforeend', `
        <div id="help-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-100 p-4"
             onclick="if(event.target===this){this.remove();isModalOpen=false;}">
            <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                    <h2 class="text-xl font-black text-slate-800">Comment ça marche ? 💡</h2>
                    <button onclick="document.getElementById('help-modal').remove();isModalOpen=false;" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
                </div>
                <ol class="text-sm text-slate-600 space-y-3 list-none">
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">1.</span> Sélectionne une catégorie dans la colonne de gauche.</li>
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">2.</span> Clique sur la carte d'un collègue pour lui offrir le badge.</li>
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">3.</span> Sur mobile, appuie sur la catégorie puis choisis ton collègue.</li>
                    <li class="flex gap-3"><span class="font-black text-blue-500 shrink-0">4.</span> Tu as 15 secondes pour annuler via le bouton qui apparaît.</li>
                    <li class="flex gap-3"><span class="font-black text-orange-500 shrink-0">⚠️</span> Quand le seuil d'une catégorie est atteint, un gage s'active !</li>
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
            <h3 class="font-bold text-gray-800 text-lg">${user.name} ${isMe ? '(toi)' : ''}</h3>
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
                    showToast("Interdit de s'auto-mousser ! 😅", 'error');
                    selectedCategoryId = null;
                    clearSelection();
                }
            };
            div.onclick = () => {
                if (selectedCategoryId) {
                    showToast("Interdit de s'auto-mousser ! 😅", 'error');
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

function updateCardUI(card, user) {
    card.querySelector('.user-points-total').innerText = `${user.total_points || 0} pts`;
    
    const rankBadge = card.querySelector('.rank-badge');
    rankBadge.innerText = `#${user.rank}`;
    const rankColor = user.rank === 1 ? 'bg-yellow-400' : (user.rank === 2 ? 'bg-slate-300' : (user.rank === 3 ? 'bg-amber-600' : 'bg-blue-500'));
    rankBadge.className = `rank-badge absolute top-3 right-3 ${rankColor} text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm`;

    const catContainer = card.querySelector('.top-categories-container');
    catContainer.innerHTML = (user.topCategories || []).map(cat => `
        <div class="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
            <span class="text-sm">${cat.emoji}</span>
            <span class="text-[10px] font-bold ml-1 text-gray-500">${cat.count}</span>
        </div>`).join('') || '<span class="text-[10px] text-gray-400 italic">Aucun badge</span>';

    // Gestion du gage
    const banner = card.querySelector('.gage-banner');
    if (user.gage) {
        card.classList.add('gage-active', 'border-orange-500');
        if (!banner) {
            const b = document.createElement('div');
            b.className = 'gage-banner absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg z-10 whitespace-nowrap';
            card.appendChild(b);
        }
        card.querySelector('.gage-banner').innerText = `🚨 GAGE : ${user.gage.toUpperCase()}`;
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
                <p class="text-slate-500 text-sm font-medium">À qui offres-tu ce badge ?</p>
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
                Annuler
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
                showToast(`🚨 Gage activé pour ${data.gageTriggered.name} : ${data.gageTriggered.dare} !`, 'danger');
            } else if (data.gageWarning) {
                showToast(`⚠️ Encore 1 point pour déclencher le gage de ${data.gageWarning.name} !`, 'warning');
            } else {
                showToast('Point envoyé !', 'success');
            }
            await updateAllData();

            setTimeout(() => {
                cardEl.classList.remove('ring-4', 'ring-green-500');
            }, 500);
        } else {
            const errorData = await res.json();
            showToast(errorData.error || "Une erreur est survenue", "bg-orange-500");
            selectedCategoryId = null;
            clearSelection();
        }
    } catch (e) {
        console.error("Erreur réseau :", e);
        showToast("Impossible de contacter le serveur", "bg-red-600");
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
        ? `<button onclick="undoLastPoint()" class="text-yellow-200 font-black uppercase text-xs hover:text-white transition-colors shrink-0">Annuler</button>`
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

            const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            if (diffInDays === 0 && date.getDate() === now.getDate()) {
                return `Aujourd'hui à ${time}`;
            } else if (diffInDays === 1 || (diffInDays === 0 && date.getDate() !== now.getDate())) {
                return `Hier à ${time}`;
            } else {
                const dayMonth = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
                return `${dayMonth} à ${time}`;
            }
        }
        
        isModalOpen = true;

        const historyHtml = `
            <div id="history-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-100 p-4"
                 onclick="if(event.target === this) { this.remove(); isModalOpen = false; }">
                <div class="bg-white rounded-3xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div class="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h2 class="text-xl font-black text-slate-800">Historique de ${userName}</h2>
                        <button onclick="document.getElementById('history-modal').remove(); isModalOpen = false;" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
                    </div>
                    
                    <h3 class="font-black text-[10px] uppercase tracking-widest text-blue-500 mb-4 flex items-center gap-2">
                        <span class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span> Derniers points reçus
                    </h3>
                    <div class="space-y-3 mb-8">
                        ${data.received.length > 0 ? data.received.map(p => `
                            <div class="flex items-center justify-between text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <span class="text-slate-700">${p.emoji} <b>${p.cat_name}</b> <span class="text-slate-400 text-xs">de</span> ${p.from_name}</span>
                                <span class="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md shadow-sm">${formatSmartDate(p.created_at)}</span>
                            </div>
                        `).join('') : '<p class="text-xs italic text-slate-400 py-2 text-center">Aucun point reçu pour le moment</p>'}
                    </div>

                    <h3 class="font-black text-[10px] uppercase tracking-widest text-emerald-500 mb-4 flex items-center gap-2">
                        <span class="w-2 h-2 bg-emerald-500 rounded-full"></span> Derniers points donnés
                    </h3>
                    <div class="space-y-3">
                        ${data.given.length > 0 ? data.given.map(p => `
                            <div class="flex items-center justify-between text-sm bg-emerald-50/30 p-3 rounded-xl border border-emerald-100">
                                <span class="text-slate-700">Offert ${p.emoji} <b>${p.cat_name}</b> <span class="text-slate-400 text-xs">à</span> ${p.to_name}</span>
                                <span class="text-[10px] font-bold text-emerald-600/50 bg-white px-2 py-1 rounded-md shadow-sm">${formatSmartDate(p.created_at)}</span>
                            </div>
                        `).join('') : '<p class="text-xs italic text-slate-400 py-2 text-center">Aucun point donné pour le moment</p>'}
                    </div>

                    ${data.dares && data.dares.length > 0 ? `
                    <h3 class="font-black text-[10px] uppercase tracking-widest text-orange-500 mb-4 mt-8 flex items-center gap-2">
                        <span class="w-2 h-2 bg-orange-500 rounded-full"></span> Gages accomplis
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
        alert("Erreur lors de la récupération de l'historique.");
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
                <h1 class="text-2xl font-bold text-gray-800">Session invalide 🔒</h1>
                <p class="text-gray-600 mt-2">Demande un nouveau lien magique à ton admin.</p>
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

async function renderLanding() {
    let cfg = {};
    try {
        const res = await fetch('/api/config');
        if (res.ok) cfg = await res.json();
    } catch {}

    document.body.innerHTML = `
        <div class="min-h-screen bg-gray-100 p-4 flex flex-col items-center justify-center">
            <div class="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-5">
                <div class="text-center">
                    <h1 class="text-3xl font-black text-slate-800">🎯 Donne Ton Point</h1>
                    <p class="text-sm text-slate-500 mt-2">Le rituel d'équipe pour s'offrir points et gages.</p>
                </div>

                <div class="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 border border-slate-200">
                    <h2 class="font-bold text-slate-800 mb-1">Tu as déjà un lien magique ?</h2>
                    <p class="text-xs text-slate-600">Clique simplement dessus pour te connecter (format <span class="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">/login/&lt;token&gt;</span>).</p>
                </div>

                <div class="border border-slate-200 rounded-xl p-4">
                    <h2 class="font-bold text-slate-800 mb-3">✨ Crée ton espace</h2>
                    <form id="onboarding-form" class="space-y-3">
                        <input id="ob-company" type="text" required minlength="2" maxlength="60" placeholder="Nom de ta société ou équipe" class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                        <input id="ob-admin" type="text" required minlength="1" maxlength="40" placeholder="Ton prénom" class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                        <div class="cf-turnstile" data-sitekey="${cfg.turnstileSiteKey || ''}" data-size="flexible"></div>
                        <button type="submit" id="ob-submit" class="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">Lancer mon équipe 🚀</button>
                        <p id="ob-error" class="text-red-600 text-xs text-center hidden"></p>
                    </form>
                </div>

                <p class="text-[10px] text-slate-400 text-center">En créant ton espace, tu deviens son administrateur et reçois ton lien magique de connexion.</p>
            </div>
        </div>`;

    if (cfg.turnstileSiteKey && !document.querySelector('script[src*="turnstile"]')) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
    }

    document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('ob-error');
        const submitBtn = document.getElementById('ob-submit');
        errEl.classList.add('hidden');

        const company = document.getElementById('ob-company').value.trim();
        const admin = document.getElementById('ob-admin').value.trim();
        const ts = document.querySelector('[name="cf-turnstile-response"]')?.value || '';

        if (!ts) {
            errEl.textContent = "Patiente quelques secondes pour la vérification anti-bot…";
            errEl.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Création en cours…";

        try {
            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_name: company, admin_name: admin, turnstile_token: ts })
            });

            if (res.ok) {
                const data = await res.json();
                window.location.href = `/login/${data.token}`;
                return;
            }
            const err = await res.json().catch(() => ({}));
            errEl.textContent = err.error || "Erreur lors de la création";
            errEl.classList.remove('hidden');
        } catch {
            errEl.textContent = "Impossible de joindre le serveur";
            errEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Lancer mon équipe 🚀";
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
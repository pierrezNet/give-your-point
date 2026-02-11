let selectedCategoryId = null;
let lastPointId = null;

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

async function loadCategories() {
    const catList = document.getElementById('categories-list');
    
    // Sécurité : on sort si l'élément n'existe pas encore
    if (!catList) return;
    /*if (!catList) {
        console.warn("⚠️ L'élément 'categories-list' n'a pas été trouvé dans le HTML.");
        return;
    }*/

    const res = await fetch('/api/categories');
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
            ${isMe ? 'cursor-not-allowed hover:bg-red-100' : 'cursor-pointer hover:shadow-md border-transparent'}`;
        
        div.innerHTML = `
            <button onclick="showHistory(event, '${user.id}', '${user.name}')" 
                    class="absolute top-3 left-3 text-slate-300 hover:text-blue-500 hover:scale-110 transition-all z-30 p-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>
            <div class="rank-badge absolute top-3 right-3 text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm"></div>
            <div class="collapse lg:visible w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full mb-3 flex items-center justify-center text-blue-600 text-2xl font-bold border border-blue-100 shadow-inner">
                ${(user.name || "U")[0].toUpperCase()}
            </div>
            <h3 class="font-bold text-gray-800 text-lg">${user.name} ${isMe ? '(Toi)' : ''}</h3>
            <p class="user-points-total text-blue-600 font-black text-sm mb-3"></p>
            <div class="top-categories-container flex gap-2 mt-2"></div>
        `;

        // Événements : Uniquement si ce n'est PAS ma carte
        if (!isMe) {
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
    const res = await fetch('/api/users-stats');
    const users = await res.json();
    const myId = localStorage.getItem('my_user_id');

    const overlay = document.createElement('div');
    overlay.id = 'wheel-selector';
    overlay.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-4";
    
    // On filtre pour ne pas s'auto-mousser
    const otherUsers = users.filter(u => String(u.id) !== String(myId));

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

            <button onclick="document.getElementById('wheel-selector').remove()" 
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

    requestAnimationFrame(async () => {
        const cardMock = document.createElement('div');
        await addPoint(userId, cardMock, catId);
    });
};

function clearSelection() {
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('ring-4', 'ring-blue-500', 'category-active'));
}

async function addPoint(userId, cardEl, catId) {
    const myId = localStorage.getItem('my_user_id');
    try {
        const res = await fetch('/api/points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${myId}` },
            body: JSON.stringify({ to_user_id: String(userId), category_id: String(catId) })
        });

        if (res.ok) {
            // 1. Nettoyage immédiat
            selectedCategoryId = null;
            clearSelection();
            if (document.activeElement) document.activeElement.blur();

            // 2. Animation de succès
            cardEl.classList.add('ring-4', 'ring-green-500');

            showToast("Point envoyé !", 'success');  

            // 3. MISE À JOUR SYNCHRONE
            await updateAllData(); 

            setTimeout(() => {
                cardEl.classList.remove('ring-4', 'ring-green-500');
            }, 500);
        }
        if (!res.ok) {
            const errorData = await res.json();
            // On utilise le système de toast
            showToast(errorData.error || "Une erreur est survenue", "bg-orange-500");
            
            // On nettoie quand même la sélection pour ne pas rester bloqué
            selectedCategoryId = null;
            clearSelection();
            return; 
        }
        selectedCategoryId = null;
        clearSelection();
        cardEl.classList.add('ring-4', 'ring-green-500'); 
        await updateAllData(); 

        setTimeout(() => {
            cardEl.classList.remove('ring-4', 'ring-green-500');
        }, 500);
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
    
    // On change la couleur selon le type (Succès = sombre, Erreur = orange/rouge)
    const bgColor = type === 'success' ? 'bg-slate-800' : 'bg-orange-600';
    
    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 ${bgColor} text-white px-6 py-3 rounded-full shadow-2xl z-[200] flex items-center gap-4 animate-in slide-in-from-bottom-10`;
    
    // Si c'est un succès, on ajoute le bouton "Annuler"
    const undoButton = type === 'success' 
        ? `<button onclick="undoLastPoint()" class="text-yellow-400 font-black uppercase text-xs hover:text-yellow-300 transition-colors">Annuler</button>` 
        : '';

    toast.innerHTML = `
        <span class="text-sm font-medium">${message}</span>
        ${undoButton}
    `;
    
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast) {
            toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-10');
            setTimeout(() => toast.remove(), 1000);
        }
    }, 5000);
}

async function updateAllData() {
    try {
        const [statsRes, leaderboardRes] = await Promise.all([
            fetch('/api/users-stats'),
            fetch('/api/leaderboard')
        ]);

        // Si l'une des deux requêtes a échoué (404, 500, etc.)
        if (!statsRes.ok || !leaderboardRes.ok) {
            throw new Error(`Erreur Serveur: Stats(${statsRes.status}) Leaderboard(${leaderboardRes.status})`);
        }

        const users = await statsRes.json();
        const leaderboard = await leaderboardRes.json();

        if (document.startViewTransition) {
            document.startViewTransition(() => {
                renderUsers(users);
                renderLeaderboardUI(leaderboard);
            });
        } else {
            renderUsers(users);
            renderLeaderboardUI(leaderboard);
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
        const res = await fetch(`/api/users/${userId}/history`);
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

        const historyHtml = `
            <div id="history-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" 
                 onclick="if(event.target === this) this.remove()">
                <div class="bg-white rounded-3xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div class="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h2 class="text-xl font-black text-slate-800">Historique de ${userName}</h2>
                        <button onclick="document.getElementById('history-modal').remove()" class="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
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
                                <span class="text-slate-700">Offert ${p.emoji} <span class="text-slate-400 text-xs">à</span> ${p.to_name}</span>
                                <span class="text-[10px] font-bold text-emerald-600/50 bg-white px-2 py-1 rounded-md shadow-sm">${formatSmartDate(p.created_at)}</span>
                            </div>
                        `).join('') : '<p class="text-xs italic text-slate-400 py-2 text-center">Aucun point donné pour le moment</p>'}
                    </div>
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
    const myId = localStorage.getItem('my_user_id');
    const res = await fetch('/api/points/undo', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${myId}` }
    });

    if (res.ok) {
        // On cache le toast
        const toast = document.getElementById('undo-toast');
        if (toast) toast.remove();
        // On rafraîchit les scores
        await updateAllData();
    }
}

async function init() {
    const myId = handleAuth();

    if (!myId) {
        document.body.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
                <h1 class="text-2xl font-bold text-gray-800">Accès restreint 🔒</h1>
                <p class="text-gray-600 mt-2">Utilise ton lien magique pour te connecter.</p>
            </div>`;
        return;
    }

    const userName = localStorage.getItem('my_user_name');
    const displayEl = document.getElementById('current-user-display');
    if (displayEl && userName) {
        displayEl.innerText = userName;
    }

    await Promise.all([
        loadCategories(),
        updateAllData()
    ]);
}

setInterval(() => {
    updateAllData();
}, 30000);

// Lancement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
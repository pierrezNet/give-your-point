let selectedCategoryId = null;

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
    if (!catList) {
        console.warn("⚠️ L'élément 'categories-list' n'a pas été trouvé dans le HTML.");
        return;
    }

    const res = await fetch('/api/categories');
    const categories = await res.json();

    catList.innerHTML = '';

    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-card bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all';
        div.draggable = true;
        div.innerHTML = `<span class="text-2xl pointer-events-none">${cat.emoji}</span> <span class="font-medium pointer-events-none">${cat.name}</span>`;

        div.onclick = () => selectCategory(div, String(cat.id));
        div.ondragstart = (e) => e.dataTransfer.setData('text/plain', String(cat.id));
        catList.appendChild(div);
    });
}

function renderUsers(users) {
    const usersGrid = document.getElementById('users-grid');
    const myId = localStorage.getItem('my_user_id');
    usersGrid.innerHTML = '';

    users.forEach(user => {
        const isMe = String(user.id) === String(myId);
        const div = document.createElement('div');
        div.setAttribute('data-user-id', user.id); 
        div.style.viewTransitionName = `card-${user.id}`;
        
        // Style de la carte : si c'est moi, on grise et on désactive le curseur
        div.className = `user-card relative bg-white p-6 rounded-2xl shadow-sm border-2 transition-all flex flex-col items-center text-center 
            ${isMe ? 'cursor-not-allowed hover:bg-red-100' : 'cursor-pointer hover:shadow-md border-transparent'}`;
        
        div.innerHTML = `
            <button onclick="showHistory(event, '${user.id}', '${user.name}')" 
                    class="absolute top-3 left-3 text-slate-300 hover:text-blue-500 hover:scale-110 transition-all z-30 p-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>
            <div class="rank-badge absolute top-3 right-3 text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm"></div>
            <div class="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full mb-3 flex items-center justify-center text-blue-600 text-2xl font-bold border border-blue-100 shadow-inner">
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

// La fonction de création
async function addCategory() {
    console.log("Tentative d'ajout de catégorie...");
    
    const nameInput = document.getElementById('new-cat-name');
    const emojiInput = document.getElementById('new-cat-emoji');
    
    // On récupère le mot de passe (soit stocké, soit via prompt)
    let adminPass = localStorage.getItem('admin_password');
    if (!adminPass) {
        adminPass = prompt("Mot de passe admin requis :");
        if (adminPass) localStorage.setItem('admin_password', adminPass);
    }

    if (!nameInput.value || !emojiInput.value) {
        alert("Merci de remplir le nom et l'émoji !");
        return;
    }

    try {
        const response = await fetch('/api/admin/categories', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Admin-Password': adminPass 
            },
            body: JSON.stringify({
                name: nameInput.value,
                emoji: emojiInput.value
            })
        });

        if (response.ok) {
            nameInput.value = '';
            emojiInput.value = '';
            alert("Badge créé avec succès !");
            location.reload(); // On rafraîchit pour voir la nouvelle liste
        } else {
            const errorData = await response.json();
            alert("Erreur : " + (errorData.error || "Accès refusé"));
        }
    } catch (err) {
        console.error("Erreur lors de l'envoi :", err);
        alert("Impossible de contacter le serveur.");
    }
}
window.addCategory = addCategory;

function selectCategory(el, id) {
    const isAlreadySelected = el.classList.contains('ring-blue-500');
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('ring-4', 'ring-blue-500', 'category-active'));
    
    if (!isAlreadySelected) {
        selectedCategoryId = id;
        el.classList.add('ring-4', 'ring-blue-500', 'category-active');
    } else {
        selectedCategoryId = null;
    }
}

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

            showUndoToast();    

            // 3. MISE À JOUR SYNCHRONE
            await updateAllData(); 

            setTimeout(() => {
                cardEl.classList.remove('ring-4', 'ring-green-500');
            }, 500);
        }
    } catch (e) { console.error(e); }
}

function showUndoToast() {
    // On supprime l'ancien toast s'il existe
    const oldToast = document.getElementById('undo-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'undo-toast';
    // Style flottant en bas
    toast.className = "fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl z-[200] flex items-center gap-4 animate-in slide-in-from-bottom-10";
    toast.innerHTML = `
        <span class="text-sm font-medium">Point envoyé !</span>
        <button onclick="undoLastPoint()" class="text-yellow-400 font-black uppercase text-xs hover:text-yellow-300 transition-colors">
            Annuler
        </button>
    `;
    document.body.appendChild(toast);

    // Il disparaît tout seul après 5 secondes
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
        
        console.log("✅ Données reçues avec succès !");

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
        const formatDate = (dateStr) => {
            if (!dateStr) return "---";
            const dateObj = new Date(dateStr);
            return dateObj.toLocaleDateString('fr-FR', { 
                day: '2-digit', month: '2-digit', 
                hour: '2-digit', minute: '2-digit' 
            });
        };

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
                                <span class="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md shadow-sm">${formatDate(p.created_at)}</span>
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
                                <span class="text-[10px] font-bold text-emerald-600/50 bg-white px-2 py-1 rounded-md shadow-sm">${formatDate(p.created_at)}</span>
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

// Lancement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
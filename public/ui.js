// public/ui.js — Modale de confirmation + toasts stylés (remplacent les confirm()/alert() natifs).
// Dark-aware : réutilise les classes bg-white / text-slate-* remappées par input.css.
// API : uiToast(message, type?)  ·  await uiConfirm(message, opts?) → Promise<boolean>
(function () {

    // --- Toasts (remplacent alert) ---
    function toastRoot() {
        let root = document.getElementById('ui-toast-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'ui-toast-root';
            root.className = 'fixed z-[9999] bottom-4 right-4 flex flex-col gap-2 items-end pointer-events-none';
            document.body.appendChild(root);
        }
        return root;
    }

    window.uiToast = function (message, type = 'info') {
        const styles = {
            info: 'bg-slate-800 text-white',
            success: 'bg-emerald-600 text-white',
            error: 'bg-red-600 text-white',
        };
        const el = document.createElement('div');
        el.className = `pointer-events-auto max-w-xs px-4 py-3 rounded-xl shadow-lg text-sm font-bold ${styles[type] || styles.info} opacity-0 translate-y-2 transition-all duration-200`;
        el.textContent = message;
        toastRoot().appendChild(el);
        requestAnimationFrame(() => el.classList.remove('opacity-0', 'translate-y-2'));
        setTimeout(() => {
            el.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => el.remove(), 250);
        }, 3400);
    };

    // --- Modale de confirmation (remplace confirm) → Promise<boolean> ---
    window.uiConfirm = function (message, opts = {}) {
        return new Promise((resolve) => {
            const okText = opts.okText || (window.t ? t('common.confirm') : 'Confirmer');
            const cancelText = opts.cancelText || (window.t ? t('common.cancel') : 'Annuler');

            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4 opacity-0 transition-opacity duration-150';
            overlay.innerHTML = `
                <div class="ui-box bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 scale-95 transition-transform duration-150">
                    <p class="ui-msg text-slate-700 text-sm leading-relaxed mb-5"></p>
                    <div class="flex justify-end gap-2">
                        <button class="ui-cancel px-4 py-2 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-100 transition-colors"></button>
                        <button class="ui-ok px-4 py-2 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors"></button>
                    </div>
                </div>`;
            overlay.querySelector('.ui-msg').textContent = message;
            overlay.querySelector('.ui-ok').textContent = okText;
            overlay.querySelector('.ui-cancel').textContent = cancelText;
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.remove('opacity-0');
                overlay.querySelector('.ui-box').classList.remove('scale-95');
            });

            function onKey(ev) {
                if (ev.key === 'Escape') close(false);
                else if (ev.key === 'Enter') close(true);
            }
            function close(val) {
                document.removeEventListener('keydown', onKey);
                overlay.classList.add('opacity-0');
                overlay.querySelector('.ui-box').classList.add('scale-95');
                setTimeout(() => overlay.remove(), 150);
                resolve(val);
            }

            overlay.querySelector('.ui-ok').onclick = () => close(true);
            overlay.querySelector('.ui-cancel').onclick = () => close(false);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
            document.addEventListener('keydown', onKey);
            overlay.querySelector('.ui-ok').focus();
        });
    };

    // --- Saisie de texte (remplace prompt) → Promise<string|null> (null si annulé) ---
    window.uiPrompt = function (message, defaultValue = '', opts = {}) {
        return new Promise((resolve) => {
            const okText = opts.okText || (window.t ? t('common.confirm') : 'Confirmer');
            const cancelText = opts.cancelText || (window.t ? t('common.cancel') : 'Annuler');

            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4 opacity-0 transition-opacity duration-150';
            overlay.innerHTML = `
                <div class="ui-box bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 scale-95 transition-transform duration-150">
                    <p class="ui-msg text-slate-700 text-sm leading-relaxed mb-3"></p>
                    <input class="ui-input w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 mb-5" type="text" />
                    <div class="flex justify-end gap-2">
                        <button class="ui-cancel px-4 py-2 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-100 transition-colors"></button>
                        <button class="ui-ok px-4 py-2 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors"></button>
                    </div>
                </div>`;
            overlay.querySelector('.ui-msg').textContent = message;
            overlay.querySelector('.ui-ok').textContent = okText;
            overlay.querySelector('.ui-cancel').textContent = cancelText;
            const input = overlay.querySelector('.ui-input');
            input.value = defaultValue || '';
            if (opts.placeholder) input.placeholder = opts.placeholder;
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.remove('opacity-0');
                overlay.querySelector('.ui-box').classList.remove('scale-95');
            });

            function onKey(ev) {
                if (ev.key === 'Escape') close(null);
                else if (ev.key === 'Enter') close(input.value);
            }
            function close(val) {
                document.removeEventListener('keydown', onKey);
                overlay.classList.add('opacity-0');
                overlay.querySelector('.ui-box').classList.add('scale-95');
                setTimeout(() => overlay.remove(), 150);
                resolve(val);
            }

            overlay.querySelector('.ui-ok').onclick = () => close(input.value);
            overlay.querySelector('.ui-cancel').onclick = () => close(null);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
            document.addEventListener('keydown', onKey);
            setTimeout(() => { input.focus(); input.select(); }, 50);
        });
    };
})();

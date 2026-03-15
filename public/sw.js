self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data;
    try { data = event.data.json(); }
    catch { data = { title: 'Donne Ton Point 🎯', body: event.data.text() }; }

    event.waitUntil(
        self.registration.showNotification(data.title || 'Donne Ton Point 🎯', {
            body: data.body || 'Vous avez reçu un point !',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'dtp-point',
            data: { url: data.url || '/' },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            const targetUrl = event.notification.data?.url || '/';
            for (const client of windowClients) {
                if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});

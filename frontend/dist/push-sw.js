/* Push notifications for Unmute, loaded into the app's service worker (see vite.config.ts). */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    return;
  }
  const tag = data.conversationId ? `conv-${data.conversationId}` : 'unmute';

  if (data.type === 'call') {
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon,
        badge: '/pwa-192x192.png',
        tag,
        renotify: true,
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400],
        data: { url: data.url },
      })
    );
  } else if (data.type === 'call-ended') {
    // The call stopped ringing: swap the ringing notification for "Missed call".
    event.waitUntil(
      self.registration.getNotifications({ tag }).then((open) => {
        const ringing = open.find((n) => n.requireInteraction);
        open.forEach((n) => n.close());
        if (!ringing) return undefined;
        return self.registration.showNotification(ringing.title, {
          body: 'Missed call',
          icon: ringing.icon,
          badge: '/pwa-192x192.png',
          tag,
          data: { url: data.url },
        });
      })
    );
  } else if (data.type === 'message') {
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag,
        data: { url: data.url },
      })
    );
  }
});

// Tapping a notification opens (or focuses) Unmute on that conversation.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});

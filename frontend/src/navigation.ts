/** Primary app destinations, shared by the desktop navbar and the mobile bottom bar. */
export interface NavItem {
  to: string;
  label: string;
  /** Remixicon base name; `-line` / `-fill` is appended for inactive / active. */
  icon: string;
  /** Show in the desktop top navigation / the mobile bottom bar. */
  desktop: boolean;
  mobile: boolean;
  /** Shows the unread message count. */
  unreadBadge?: boolean;
  /** Shows the number of matches. */
  matchBadge?: boolean;
  /** Shows the unread notification count. */
  notificationBadge?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/discover', label: 'Discover', icon: 'ri-fire', desktop: true, mobile: true },
  { to: '/matches', label: 'Matches', icon: 'ri-heart-3', desktop: true, mobile: true, matchBadge: true },
  { to: '/chat', label: 'Chats', icon: 'ri-chat-smile-2', desktop: true, mobile: true, unreadBadge: true },
  { to: '/notifications', label: 'Notifications', icon: 'ri-notification-3', desktop: true, mobile: false, notificationBadge: true },
  { to: '/profile', label: 'Profile', icon: 'ri-user-3', desktop: true, mobile: true },
  { to: '/settings', label: 'Settings', icon: 'ri-settings-3', desktop: true, mobile: false },
];

/** Sub-pages keep their section active: `/chat/:id` → Chats, `/discover/filters` → Discover, `/settings/…`, `/safety` → Settings. */
export function isNavActive(item: NavItem, path: string): boolean {
  if (item.to === '/settings' && path === '/safety') return true;
  if (item.to === '/discover' && path.startsWith('/people/')) return true;
  return path === item.to || path.startsWith(`${item.to}/`);
}

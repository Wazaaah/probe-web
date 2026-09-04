/**
 * Telling the other person something happened.
 *
 * A banner covers the case where they are looking at the tab; a system notification
 * covers the case where they are not. Permission is asked for on a real interaction —
 * never on load, which browsers now refuse anyway.
 */

export function canNotify(): boolean {
  return typeof Notification !== 'undefined'
}

export function notificationsAllowed(): boolean {
  return canNotify() && Notification.permission === 'granted'
}

export async function askToNotify(): Promise<boolean> {
  if (!canNotify() || Notification.permission === 'denied') return false
  if (Notification.permission === 'granted') return true
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Only fires when the tab is not the one being looked at — otherwise the banner has it. */
export function notify(title: string, body: string): void {
  if (!notificationsAllowed() || document.visibilityState === 'visible') return
  try {
    new Notification(title, { body, tag: 'probe', icon: undefined })
  } catch {
    /* some browsers require a service worker; the banner still covers it */
  }
}

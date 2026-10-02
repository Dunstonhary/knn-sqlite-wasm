import type { FaqEntry } from './types'

/**
 * Demo corpus. Production targets 5k-50k entries loaded from SQLite; these
 * fourteen exist so the UI has something to rank before that lands.
 */
export const FAQ: FaqEntry[] = [
  {
    area: 'Payments',
    q: 'How do I connect a payment provider?',
    a: 'Go to Settings → Payments and select your provider (Stripe, PayPal). Authenticate and your account links automatically.',
    tags: ['payment', 'provider', 'stripe', 'paypal', 'connect', 'billing', 'checkout'],
  },
  {
    area: 'Payments',
    q: 'Why did a customer payment fail?',
    a: 'Failed payments usually mean an expired card, insufficient funds, or a declined authorization. Check the transaction log under Payments → Activity.',
    tags: ['payment', 'failed', 'decline', 'card', 'transaction', 'refund'],
  },
  {
    area: 'Payments',
    q: 'How do I issue a refund?',
    a: 'Open the transaction in Payments → Activity, click it, and choose Refund. Partial refunds are supported.',
    tags: ['refund', 'payment', 'money', 'return', 'transaction'],
  },
  {
    area: 'Inbox',
    q: 'How do I assign a conversation to a teammate?',
    a: 'Open the conversation, click the assignee menu in the header, and pick a team member. They get notified instantly.',
    tags: ['inbox', 'assign', 'conversation', 'teammate', 'route', 'chat'],
  },
  {
    area: 'Inbox',
    q: 'Can I set up canned responses?',
    a: 'Yes. Settings → Inbox → Saved replies lets you create reusable snippets you can insert with a shortcut.',
    tags: ['inbox', 'canned', 'saved reply', 'snippet', 'template', 'macro'],
  },
  {
    area: 'Inbox',
    q: 'How do I filter unread messages?',
    a: 'Use the filter bar at the top of the Inbox and toggle Unread. Combine it with channel and assignee filters.',
    tags: ['inbox', 'filter', 'unread', 'message', 'sort'],
  },
  {
    area: 'Contacts',
    q: 'How do I merge duplicate contacts?',
    a: 'Select two contacts, then choose Merge. The primary record keeps its details and history is combined.',
    tags: ['contacts', 'merge', 'duplicate', 'record', 'people'],
  },
  {
    area: 'Contacts',
    q: 'How do I import contacts from a CSV?',
    a: 'Contacts → Import → Upload CSV. Map your columns to fields and confirm. Large files import in the background.',
    tags: ['contacts', 'import', 'csv', 'upload', 'bulk'],
  },
  {
    area: 'Connect',
    q: 'How do I share my Connect scheduling link?',
    a: 'Open Connect, copy your personal booking link, and share it. Visitors pick a slot based on your availability.',
    tags: ['connect', 'scheduling', 'booking', 'link', 'calendar', 'meeting'],
  },
  {
    area: 'Connect',
    q: 'Can I set my availability hours?',
    a: 'In Connect → Availability, define working hours per day. Buffer times and time-zone handling are automatic.',
    tags: ['connect', 'availability', 'hours', 'calendar', 'timezone'],
  },
  {
    area: 'Settings',
    q: 'How do I add a team member?',
    a: 'Settings → Team → Invite. Enter their email and pick a role. They receive an invite to join your workspace.',
    tags: ['settings', 'team', 'invite', 'member', 'role', 'user', 'permission'],
  },
  {
    area: 'Settings',
    q: 'How do I change my notification preferences?',
    a: 'Settings → Notifications lets you toggle email, push, and in-app alerts per event type.',
    tags: ['settings', 'notification', 'alert', 'email', 'push', 'preference'],
  },
  {
    area: 'Integrations',
    q: 'How do I connect Slack?',
    a: 'Integrations → Slack → Connect, then authorize the workspace. Choose which channels receive notifications.',
    tags: ['integration', 'slack', 'connect', 'notification', 'channel'],
  },
  {
    area: 'Integrations',
    q: 'Is there an API or webhook?',
    a: 'Yes. Integrations → Developer exposes API keys and webhook endpoints for events like new message or new contact.',
    tags: ['integration', 'api', 'webhook', 'developer', 'endpoint', 'key'],
  },
]

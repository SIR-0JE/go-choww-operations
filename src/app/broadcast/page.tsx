import { redirect } from 'next/navigation';

// Broadcast was replaced by the Customers page; keep old links and bookmarks working
export default function BroadcastRedirect() {
  redirect('/customers');
}

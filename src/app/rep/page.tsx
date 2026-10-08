import { redirect } from 'next/navigation';

// Short link for reps: /rep opens the rep app (same as /collector)
export default function RepIndexPage() {
  redirect('/collector');
}

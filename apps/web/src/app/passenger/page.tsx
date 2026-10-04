import { PassengerHome } from '@/components/ride/passenger-home';
import { requireUser } from '@/lib/session';

export default async function PassengerPage() {
  await requireUser('PASSENGER'); // the page checks too: a layout's check doesn't stop the page rendering
  return <PassengerHome />;
}

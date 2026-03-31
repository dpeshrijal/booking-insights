import bookingsData from "@/data/bookings.json";
import { Booking } from "@/types";
import { getDashboardStats } from "@/lib/booking-insights";
import { BookingInsightsClient } from "@/components/dashboard/BookingInsightsClient";

export default function Page() {
  const bookings = bookingsData as Booking[];
  const stats = getDashboardStats(bookings);

  return <BookingInsightsClient bookings={bookings} stats={stats} />;
}

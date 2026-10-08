import { EventDirectory } from "@/components/event-directory";
import { isAdmin } from "@/lib/auth";

export default async function HomePage() {
  const monthParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric" })
      .formatToParts(new Date())
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return <EventDirectory isAdmin={await isAdmin()} calendarStart={{ year: Number(monthParts.year), month: Number(monthParts.month) }} />;
}

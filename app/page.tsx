import { EventDirectory } from "@/components/event-directory";
import { centralWall } from "@/lib/utils";

export default async function HomePage() {
  const { year, month } = centralWall(new Date());
  return <EventDirectory calendarStart={{ year, month }} />;
}

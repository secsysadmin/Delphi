import type { Metadata } from "next";
import { EventRegistration } from "@/components/event-registration";
import { getEvent } from "@/lib/store";

type EventPageProps = { params: Promise<{ slug: string }> };

async function eventForMetadata(slug: string) {
  try {
    return await getEvent(slug);
  } catch (error) {
    console.error(`Could not load event ${slug} for metadata`, error);
    return null;
  }
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await eventForMetadata(slug);
  return { title: event?.title ?? "Event registration", description: event?.summary || undefined };
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  return <EventRegistration slug={slug} />;
}

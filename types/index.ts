export type QuestionType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "date";

export type FormField = {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
};

export type EventSlot = {
  id: string;
  label: string;
  startAt: string;
  endAt: string;
  location: string;
  capacity: number | null;
  confirmationSubject?: string;
  confirmationBody?: string;
  accentColor?: string;
  registeredCount: number;
  remaining: number | null;
};

export type RegistrationEvent = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  status: "draft" | "published" | "archived";
  capacityMode: "event" | "slot" | "unlimited";
  capacity: number | null;
  tamuEmailOnly: boolean;
  sortOrder: number;
  accentColor: string;
  formFields: FormField[];
  confirmationSubject: string;
  confirmationBody: string;
  showDateInConfirmation?: boolean;
  slots: EventSlot[];
  registeredCount: number;
  remaining: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Registration = {
  id: string;
  eventId: string;
  slotId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  uin: string;
  answers: Record<string, string | string[] | boolean>;
  status: "confirmed" | "cancelled" | "waitlisted";
  emailStatus: string;
  createdAt: string;
};

export type EventInput = Omit<
  RegistrationEvent,
  "id" | "createdAt" | "updatedAt" | "registeredCount" | "remaining" | "slots"
> & {
  slots: Array<Omit<EventSlot, "registeredCount" | "remaining">>;
};

import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { Resend } from "resend";
import type { EventSlot, Registration, RegistrationEvent } from "@/types";
import { confirmationColors, confirmationTemplate, fillTemplate, formatRange, templateValues } from "@/lib/utils";

const DEFAULT_FROM = "Student Engineers' Council <no-reply@sec.tamu.edu>";
const DEFAULT_SES_REGION = "us-east-1";
const DEFAULT_SEND_RATE_PER_SECOND = 10;
const BROADCAST_WORKERS = 5;
const MAX_SEND_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1000;
const ENCODED_WORD_MAX_BYTES = 39;
const MIME_LINE_LENGTH = 76;
const MIME_BOUNDARY = "=_SEC_Registration_Boundary";
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
const THROTTLE_ERROR_NAMES = new Set(["Throttling", "ThrottlingException"]);
const THROTTLE_MESSAGE = /rate exceeded|too many requests/i;
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" };

type Mail = { to: string; subject: string; html: string; text: string };
type Person = Pick<Registration, "firstName" | "lastName">;
type Provider = { name: "ses"; client: SESClient } | { name: "resend"; client: Resend };
type BroadcastInput = { registrations: Registration[]; event: RegistrationEvent; subject: string; body: string };

export type BroadcastResult = { sent: number; failed: number; failedEmails: string[]; preview: boolean };

let sesClient: SESClient | null = null;

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => HTML_ESCAPES[character] ?? character);

function ses() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
  sesClient ??= new SESClient({ region: process.env.AWS_REGION || DEFAULT_SES_REGION });
  return sesClient;
}

function sesProvider(): Provider | null {
  const client = ses();
  return client ? { name: "ses", client } : null;
}

function resendProvider(): Provider | null {
  return process.env.RESEND_API_KEY ? { name: "resend", client: new Resend(process.env.RESEND_API_KEY) } : null;
}

function provider() {
  if (process.env.EMAIL_PROVIDER === "resend") return resendProvider();
  if (process.env.EMAIL_PROVIDER === "ses") return sesProvider();
  return sesProvider() ?? resendProvider();
}

export function canSendEmail() {
  return provider() !== null;
}

function mailboxAddress(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value;
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const clean = cleanHeader(value);
  if (PRINTABLE_ASCII.test(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  for (const character of clean) {
    if (Buffer.byteLength(chunk + character, "utf8") > ENCODED_WORD_MAX_BYTES) {
      words.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`).join("\r\n ");
}

function encodeMailbox(value: string) {
  const match = cleanHeader(value).match(/^(.*?)\s*<([^>]+)>$/);
  if (!match || !match[1]) return cleanHeader(value);
  const name = match[1].replace(/^"|"$/g, "");
  const displayName = PRINTABLE_ASCII.test(name) ? `"${name.replace(/(["\\])/g, "\\$1")}"` : encodeHeader(name);
  return `${displayName} <${match[2]}>`;
}

function base64Mime(value: string) {
  const lines = new RegExp(`.{1,${MIME_LINE_LENGTH}}`, "g");
  return Buffer.from(value, "utf8").toString("base64").match(lines)?.join("\r\n") ?? "";
}

function rawMessage({ from, to, subject, html, text }: Mail & { from: string }) {
  return [
    `From: ${encodeMailbox(from)}`,
    `To: ${cleanHeader(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${MIME_BOUNDARY}"`,
    "",
    `--${MIME_BOUNDARY}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Mime(text),
    `--${MIME_BOUNDARY}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Mime(html),
    `--${MIME_BOUNDARY}--`,
    "",
  ].join("\r\n");
}

function isThrottle(error: unknown) {
  if (!(error instanceof Error)) return false;
  return THROTTLE_ERROR_NAMES.has(error.name) || THROTTLE_MESSAGE.test(error.message);
}

async function sendOnce(provider: Provider, from: string, mail: Mail) {
  if (provider.name === "ses") {
    const response = await provider.client.send(new SendRawEmailCommand({
      Source: mailboxAddress(from),
      Destinations: [mail.to],
      RawMessage: { Data: Buffer.from(rawMessage({ ...mail, from })) },
    }));
    return response.MessageId ?? null;
  }
  const { data, error } = await provider.client.emails.send({ from, ...mail });
  if (error) throw Object.assign(new Error(error.message), { name: error.name });
  return data?.id ?? null;
}

async function deliverEmail(mail: Mail) {
  const active = provider();
  if (!active) return null;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  for (let attempt = 1; ; attempt++) {
    try {
      return await sendOnce(active, from, mail);
    } catch (error) {
      if (attempt >= MAX_SEND_ATTEMPTS || !isThrottle(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
    }
  }
}

function confirmationHtml({ body, event, slot, when, room }: { body: string; event: RegistrationEvent; slot?: EventSlot | null; when: string; room: string }) {
  const { background: accent, foreground } = confirmationColors(event.accentColor, slot?.accentColor);
  return `<!doctype html><html><body style="margin:0;background:#f4f1ed;font-family:Arial,sans-serif;color:#242321"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#4d0710;color:#fff;padding:24px 28px"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Student Engineers' Council</div><h1 style="font-size:24px;margin:8px 0 0">Registration Confirmed</h1></div><div style="background:#fff;padding:28px;border:1px solid #e4dfd8;border-top:0"><p style="font-size:16px;line-height:1.7;white-space:pre-line">${escapeHtml(body)}</p><div style="margin:26px 0 8px;padding:20px;border:1px solid ${accent};background:${accent};color:${foreground}"><strong style="display:block;font-size:20px">${escapeHtml(event.title)}</strong>${slot ? `<span style="display:block;margin-top:6px">${escapeHtml(slot.label)}</span>` : ""}<span style="display:block;margin-top:6px">${escapeHtml(when)}</span><span style="display:block;margin-top:4px">${escapeHtml(room)}</span></div><p style="font-size:12px;color:#6b6864;margin-top:28px">SEC Registration Hub · Texas A&amp;M University</p></div></div></body></html>`;
}

function broadcastHtml(body: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px"><div style="height:8px;background:#4d0710"></div><div style="font-size:16px;line-height:1.7;white-space:pre-line;padding:24px 4px">${escapeHtml(body)}</div><p style="color:#777;font-size:12px">SEC Registration Hub · Texas A&amp;M University</p></div>`;
}

function confirmationEmail(person: Person, event: RegistrationEvent, slot?: EventSlot | null) {
  const template = confirmationTemplate(event, slot);
  const values = templateValues(person, event, slot);
  const subject = fillTemplate(template.subject, values);
  const body = fillTemplate(template.body, values);
  const when = formatRange(slot?.startAt ?? event.startAt, slot?.endAt ?? event.endAt, event.showDateInConfirmation !== false);
  const room = slot?.location || event.location;
  const text = [body, "", event.title, slot?.label, when, room].filter((line) => line !== undefined).join("\n");
  return { subject, text, html: confirmationHtml({ body, event, slot, when, room }) };
}

export async function sendConfirmation(registration: Registration, event: RegistrationEvent, slot?: EventSlot | null) {
  const { subject, text, html } = confirmationEmail(registration, event, slot);
  const id = await deliverEmail({ to: registration.email, subject, html, text });
  return { status: id ? "sent" : "previewed", id };
}

function pacer(perSecond: number) {
  const interval = 1000 / perSecond;
  let nextStart = Date.now();
  return async () => {
    const start = Math.max(nextStart, Date.now());
    nextStart = start + interval;
    if (start > Date.now()) await new Promise((resolve) => setTimeout(resolve, start - Date.now()));
  };
}

export async function sendBroadcast({ registrations, event, subject, body }: BroadcastInput): Promise<BroadcastResult> {
  if (!canSendEmail()) return { sent: registrations.length, failed: 0, failedEmails: [], preview: true };
  const failedEmails: string[] = [];
  const queue = [...registrations];
  const pace = pacer(Number(process.env.EMAIL_SEND_RATE) || DEFAULT_SEND_RATE_PER_SECOND);
  const sendTo = async (registration: Registration) => {
    await pace();
    const slot = event.slots.find((item) => item.id === registration.slotId) ?? null;
    const values = templateValues(registration, event, slot);
    const renderedBody = fillTemplate(body, values);
    try {
      await deliverEmail({ to: registration.email, subject: fillTemplate(subject, values), text: renderedBody, html: broadcastHtml(renderedBody) });
    } catch (error) {
      failedEmails.push(registration.email);
      console.error(`Broadcast to registration ${registration.id} failed`, error);
    }
  };
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await sendTo(next);
  };
  await Promise.all(Array.from({ length: Math.min(BROADCAST_WORKERS, registrations.length) }, worker));
  return { sent: registrations.length - failedEmails.length, failed: failedEmails.length, failedEmails, preview: false };
}

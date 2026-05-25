"use client";

import { useState, type ReactNode } from "react";
import { Archive, CheckCircle2, Download, Eye, FileText, Mail, MessageSquare, Paperclip, Pencil, Send, XCircle } from "lucide-react";
import { CaseService, formatStoredDate } from "@/lib/case-service";
import { archiveMessage, archiveThread, listThreads, markMessageFailed, markMessageReady, markMessageSentManual, updateDraftMessage } from "@/lib/communication/communication-service";
import { canEditCase, type PublicUser } from "@/lib/auth";
import { fileToBlob, getFileName, hasFileContent } from "@/lib/storage/file-resolver";
import { resolveCommunicationAttachmentFile } from "@/lib/storage/communication-attachment-storage";
import { downloadBlob } from "@/lib/word-templates";
import type { CommunicationAttachment, CommunicationMessage, CommunicationMessageStatus, CommunicationParticipant, CommunicationThread, SavedCaseRecord } from "@/types/case";

type CommunicationThreadListProps = {
  record: SavedCaseRecord;
  user: PublicUser | null;
  onRecordChange: (record: SavedCaseRecord) => void;
  onOpenLetters?: () => void;
};

type DraftUpdates = {
  to: CommunicationParticipant[];
  cc: CommunicationParticipant[];
  bcc: CommunicationParticipant[];
  subject: string;
  bodyText: string;
};

export function CommunicationThreadList({ record, user, onRecordChange, onOpenLetters }: CommunicationThreadListProps) {
  const threads = listThreads(record);
  const canEdit = canEditCase(user, record);

  function archive(thread: CommunicationThread) {
    const nextRecord = archiveThread(record, thread.id, user);
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
  }

  function saveDraft(thread: CommunicationThread, message: CommunicationMessage, updates: DraftUpdates) {
    const nextRecord = updateDraftMessage(record, thread.id, message.id, { ...updates, actor: user });
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
  }

  function ready(thread: CommunicationThread, message: CommunicationMessage) {
    const nextRecord = markMessageReady(record, thread.id, message.id, user);
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
  }

  function sent(thread: CommunicationThread, message: CommunicationMessage) {
    if (message.status === "draft" && !window.confirm("Dieser Entwurf ist noch nicht bereit markiert. Trotzdem als versendet protokollieren?")) return;
    const methodInput = window.prompt("Versandmethode: email, post, manual oder other", "email") ?? "email";
    const method = methodInput === "email" || methodInput === "post" || methodInput === "manual" || methodInput === "other" ? methodInput : "manual";
    const note = window.prompt("Versandnotiz optional:") ?? undefined;
    const nextRecord = markMessageSentManual(record, thread.id, message.id, { actor: user, method, note });
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
  }

  function failed(thread: CommunicationThread, message: CommunicationMessage) {
    const error = window.prompt("Fehlernotiz optional:", message.error ?? "") ?? undefined;
    const nextRecord = markMessageFailed(record, thread.id, message.id, error, user);
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
  }

  function archiveSingleMessage(thread: CommunicationThread, message: CommunicationMessage) {
    const nextRecord = archiveMessage(record, thread.id, message.id, user);
    const savedRecord = CaseService.save(nextRecord, { actor: user, skipAutoActivity: true });
    onRecordChange(savedRecord);
  }

  if (threads.length === 0) return <CommunicationEmptyState />;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryTile label="Threads" value={threads.length} />
        <SummaryTile label="Entwürfe" value={threads.reduce((sum, thread) => sum + (thread.messages ?? []).filter((message) => message.status === "draft").length, 0)} />
        <SummaryTile label="Anhänge" value={threads.reduce((sum, thread) => sum + (thread.messages ?? []).reduce((count, message) => count + (message.attachments?.length ?? 0), 0), 0)} />
      </div>
      {threads.map((thread) => (
        <CommunicationThreadCard
          key={thread.id}
          thread={thread}
          canEdit={canEdit}
          onArchive={() => archive(thread)}
          onSaveDraft={(message, updates) => saveDraft(thread, message, updates)}
          onReady={(message) => ready(thread, message)}
          onSent={(message) => sent(thread, message)}
          onFailed={(message) => failed(thread, message)}
          onArchiveMessage={(message) => archiveSingleMessage(thread, message)}
          onOpenLetters={onOpenLetters}
          record={record}
        />
      ))}
    </div>
  );
}

export function CommunicationThreadCard({
  thread,
  canEdit,
  onArchive,
  onSaveDraft,
  onReady,
  onSent,
  onFailed,
  onArchiveMessage,
  onOpenLetters,
  record,
}: {
  thread: CommunicationThread;
  canEdit: boolean;
  onArchive: () => void;
  onSaveDraft: (message: CommunicationMessage, updates: DraftUpdates) => void;
  onReady: (message: CommunicationMessage) => void;
  onSent: (message: CommunicationMessage) => void;
  onFailed: (message: CommunicationMessage) => void;
  onArchiveMessage: (message: CommunicationMessage) => void;
  onOpenLetters?: () => void;
  record?: SavedCaseRecord;
}) {
  const messages = [...(thread.messages ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const latestMessage = messages.at(-1);
  const participantText = formatParticipants(thread.participants);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20">
              {thread.channel === "email" ? <Mail size={17} /> : <MessageSquare size={17} />}
            </div>
            <div>
              <h2 className="font-extrabold text-white">{thread.subject || "Kommunikation"}</h2>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                {channelLabel(thread.channel)} · {messages.length} Nachricht(en) · zuletzt {formatStoredDate(thread.lastMessageAt || thread.updatedAt)}
              </div>
            </div>
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-400">{participantText || "Keine Teilnehmer gespeichert"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latestMessage && <CommunicationStatusBadge status={latestMessage.status} />}
          <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-extrabold text-slate-200">{thread.status}</span>
          <button
            type="button"
            disabled={!canEdit || thread.status === "archived"}
            onClick={onArchive}
            className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"
          >
            <Archive size={14} />
            Archivieren
          </button>
        </div>
      </div>
      <CommunicationMessageList messages={messages} canEdit={canEdit} onSaveDraft={onSaveDraft} onReady={onReady} onSent={onSent} onFailed={onFailed} onArchiveMessage={onArchiveMessage} onOpenLetters={onOpenLetters} record={record} />
    </section>
  );
}

export function CommunicationMessageList({
  messages,
  canEdit,
  onSaveDraft,
  onReady,
  onSent,
  onFailed,
  onArchiveMessage,
  onOpenLetters,
  record,
}: {
  messages: CommunicationMessage[];
  canEdit: boolean;
  onSaveDraft: (message: CommunicationMessage, updates: DraftUpdates) => void;
  onReady: (message: CommunicationMessage) => void;
  onSent: (message: CommunicationMessage) => void;
  onFailed: (message: CommunicationMessage) => void;
  onArchiveMessage: (message: CommunicationMessage) => void;
  onOpenLetters?: () => void;
  record?: SavedCaseRecord;
}) {
  if (messages.length === 0) {
    return <div className="mt-4 rounded-md border border-dashed border-slate-700 bg-slate-950/35 p-4 text-sm font-semibold text-slate-500">Noch keine Nachrichten in diesem Thread.</div>;
  }

  return (
    <div className="mt-5 grid gap-3">
      {messages.map((message) => (
        <CommunicationMessageCard key={message.id} message={message} canEdit={canEdit} onSaveDraft={onSaveDraft} onReady={onReady} onSent={onSent} onFailed={onFailed} onArchiveMessage={onArchiveMessage} onOpenLetters={onOpenLetters} record={record} />
      ))}
    </div>
  );
}

export function CommunicationMessageCard({
  message,
  canEdit,
  onSaveDraft,
  onReady,
  onSent,
  onFailed,
  onArchiveMessage,
  onOpenLetters,
  record,
}: {
  message: CommunicationMessage;
  canEdit: boolean;
  onSaveDraft: (message: CommunicationMessage, updates: DraftUpdates) => void;
  onReady: (message: CommunicationMessage) => void;
  onSent: (message: CommunicationMessage) => void;
  onFailed: (message: CommunicationMessage) => void;
  onArchiveMessage: (message: CommunicationMessage) => void;
  onOpenLetters?: () => void;
  record?: SavedCaseRecord;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const text = message.bodyText || stripHtml(message.bodyHtml) || "";
  const isDraft = message.status === "draft";
  const canEditDraft = canEdit && (message.status === "draft" || message.status === "ready");

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-extrabold ${directionClass(message.direction)}`}>{directionLabel(message.direction)}</span>
            <CommunicationStatusBadge status={message.status} />
            {message.relatedLetterVersionId && <span className="rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-extrabold text-violet-200">Schreiben verknüpft</span>}
          </div>
          <div className="mt-3 font-extrabold text-white">{message.subject || "Ohne Betreff"}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{formatStoredDate(message.createdAt)} · {channelLabel(message.channel)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800">
            <Eye size={14} />
            Vorschau
          </button>
          {message.relatedLetterVersionId && (
            <button type="button" onClick={onOpenLetters} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800">
              <FileText size={14} />
              Zum Schreiben
            </button>
          )}
          {canEditDraft && (
            <button type="button" onClick={() => setEditOpen(true)} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800">
              <Pencil size={14} />
              Entwurf bearbeiten
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <InfoLine label="Von" value={formatParticipant(message.from)} />
        <InfoLine label="An" value={formatParticipants(message.to)} />
        {message.cc?.length ? <InfoLine label="CC" value={formatParticipants(message.cc)} /> : null}
      </div>
      {isDraft && text && (
        <div className="mt-4 rounded-md border border-blue-400/20 bg-blue-500/10 px-3 py-2">
          <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-blue-200">Entwurfs-Vorschau</div>
          <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-blue-50">{text}</p>
        </div>
      )}
      {message.error && <div className="mt-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">{message.error}</div>}
      <CommunicationAttachmentList attachments={message.attachments ?? []} record={record} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ActionButton disabled={!canEdit || message.status === "ready" || message.status === "sent" || message.status === "archived"} onClick={() => onReady(message)} icon={<CheckCircle2 size={14} />}>Als bereit markieren</ActionButton>
        <ActionButton disabled={!canEdit || message.status === "sent" || message.status === "archived"} onClick={() => onSent(message)} icon={<Send size={14} />}>Als versendet markieren</ActionButton>
        <ActionButton disabled={!canEdit || message.status === "failed" || message.status === "sent" || message.status === "archived"} onClick={() => onFailed(message)} icon={<XCircle size={14} />}>Als fehlgeschlagen markieren</ActionButton>
        <ActionButton disabled={!canEdit || message.status === "archived"} onClick={() => onArchiveMessage(message)} icon={<Archive size={14} />}>Archivieren</ActionButton>
      </div>
      {previewOpen && <MessagePreviewModal message={message} text={text} record={record} onClose={() => setPreviewOpen(false)} />}
      {editOpen && (
        <DraftEditModal
          message={message}
          record={record}
          onClose={() => setEditOpen(false)}
          onSave={(updates) => {
            onSaveDraft(message, updates);
            setEditOpen(false);
          }}
        />
      )}
    </article>
  );
}

export function CommunicationStatusBadge({ status }: { status: CommunicationMessageStatus }) {
  const classes: Record<CommunicationMessageStatus, string> = {
    draft: "bg-amber-500/10 text-amber-100",
    ready: "bg-emerald-500/10 text-emerald-200",
    queued: "bg-blue-500/10 text-blue-200",
    sent: "bg-blue-500/10 text-blue-200",
    failed: "bg-red-500/10 text-red-200",
    received: "bg-violet-500/10 text-violet-200",
    archived: "bg-slate-800 text-slate-300",
  };
  return <span className={`rounded-md px-2.5 py-1 text-xs font-extrabold ${classes[status]}`}>{statusLabel(status)}</span>;
}

export function CommunicationAttachmentList({ attachments, record }: { attachments: CommunicationAttachment[]; record?: SavedCaseRecord }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/45 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
        <Paperclip size={14} />
        Anhänge
      </div>
      <div className="grid gap-2">
        {attachments.map((attachment) => (
          <CommunicationAttachmentRow key={attachment.id} attachment={attachment} record={record} />
        ))}
      </div>
    </div>
  );
}

function CommunicationAttachmentRow({ attachment, record }: { attachment: CommunicationAttachment; record?: SavedCaseRecord }) {
  const resolvedFile = resolveCommunicationAttachmentFile(record, attachment);
  const canDownload = hasFileContent(resolvedFile);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
            <div>
              <div className="font-bold text-slate-100">{attachment.label}</div>
        <div className="text-xs font-semibold text-slate-500">
          {getFileName(resolvedFile) ?? attachment.fileName ?? attachmentTypeLabel(attachment.type)}
          {!canDownload ? " · Datei nicht verfügbar" : ""}
        </div>
            </div>
            <button
              type="button"
        disabled={!canDownload}
        onClick={() => void downloadAttachment(attachment, record)}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-700 px-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"
            >
              <Download size={13} />
              Download
            </button>
          </div>
  );
}

export function CommunicationEmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/70 p-10 text-center">
      <Mail className="mx-auto text-slate-500" size={36} />
      <div className="mt-4 text-xl font-extrabold text-white">Noch keine Kommunikation vorhanden</div>
      <p className="mt-2 text-sm text-slate-400">Erstellen Sie aus einem Schreiben einen E-Mail-Entwurf.</p>
    </section>
  );
}

function DraftEditModal({ message, record, onClose, onSave }: { message: CommunicationMessage; record?: SavedCaseRecord; onClose: () => void; onSave: (updates: DraftUpdates) => void }) {
  const [to, setTo] = useState(formatParticipantsForInput(message.to));
  const [cc, setCc] = useState(formatParticipantsForInput(message.cc));
  const [bcc, setBcc] = useState(formatParticipantsForInput(message.bcc));
  const [subject, setSubject] = useState(message.subject ?? "");
  const [bodyText, setBodyText] = useState(message.bodyText ?? stripHtml(message.bodyHtml) ?? "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-5 shadow-xl shadow-slate-950/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-white">Entwurf bearbeiten</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Lokaler Entwurf, kein Versand an externe Anbieter.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-200">Schließen</button>
        </div>
        <div className="mt-5 grid gap-4">
          <DraftField label="An" value={to} onChange={setTo} placeholder="name@example.at, Weitere Person <mail@example.at>" />
          <DraftField label="CC" value={cc} onChange={setCc} />
          <DraftField label="BCC" value={bcc} onChange={setBcc} />
          <DraftField label="Betreff" value={subject} onChange={setSubject} />
          <label>
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500">Text</span>
            <textarea
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              className="min-h-[260px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-3 text-sm leading-6 text-slate-100 outline-none focus:border-blue-500"
            />
          </label>
          <CommunicationAttachmentList attachments={message.attachments ?? []} record={record} />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-800">Abbrechen</button>
          <button
            type="button"
            onClick={() => onSave({ to: parseParticipants(to), cc: parseParticipants(cc), bcc: parseParticipants(bcc), subject, bodyText })}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500"
          >
            Entwurf speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function ActionButton({ disabled, onClick, icon, children }: { disabled?: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-700 px-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:border-slate-800 disabled:text-slate-600"
    >
      {icon}
      {children}
    </button>
  );
}

function MessagePreviewModal({ message, text, record, onClose }: { message: CommunicationMessage; text: string; record?: SavedCaseRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-white">{message.subject || "Nachricht"}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{formatStoredDate(message.createdAt)} · {statusLabel(message.status)}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-bold text-slate-200">Schließen</button>
        </div>
        <div className="mt-5 grid gap-2 text-sm">
          <InfoLine label="Von" value={formatParticipant(message.from)} />
          <InfoLine label="An" value={formatParticipants(message.to)} />
        </div>
        <div className="mt-5 whitespace-pre-line rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm leading-7 text-slate-100">{text || "Kein Nachrichtentext gespeichert."}</div>
        <CommunicationAttachmentList attachments={message.attachments ?? []} record={record} />
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-extrabold text-white">{value}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold text-slate-300">{value || "-"}</div>
    </div>
  );
}

async function downloadAttachment(attachment: CommunicationAttachment, record?: SavedCaseRecord) {
  const resolvedFile = resolveCommunicationAttachmentFile(record, attachment);
  const blob = await fileToBlob(resolvedFile);
  if (!blob) return;
  downloadBlob(blob, getFileName(resolvedFile) || attachment.fileName || `${attachment.label}.bin`);
}

function formatParticipant(participant?: { name?: string; email?: string; role?: string }) {
  if (!participant) return "";
  const label = participant.name || participant.role || "";
  if (label && participant.email) return `${label} <${participant.email}>`;
  return participant.email || label;
}

function formatParticipants(participants?: Array<{ name?: string; email?: string; role?: string }>) {
  return (participants ?? []).map(formatParticipant).filter(Boolean).join(", ");
}

function formatParticipantsForInput(participants?: Array<{ name?: string; email?: string; role?: string }>) {
  return (participants ?? [])
    .map((participant) => {
      const label = participant.name || participant.role || "";
      if (label && participant.email) return `${label} <${participant.email}>`;
      return participant.email || label;
    })
    .filter(Boolean)
    .join(", ");
}

function parseParticipants(value: string): CommunicationParticipant[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.*?)<([^>]+)>$/);
      if (match) {
        return { name: match[1].trim() || undefined, email: match[2].trim(), type: "other" as const };
      }
      const email = item.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      return email ? { email, type: "other" as const } : { name: item, type: "other" as const };
    });
}

function statusLabel(status: CommunicationMessageStatus) {
  const labels: Record<CommunicationMessageStatus, string> = {
    draft: "Entwurf",
    ready: "Bereit",
    queued: "Warteschlange",
    sent: "Versendet",
    failed: "Fehlgeschlagen",
    received: "Empfangen",
    archived: "Archiviert",
  };
  return labels[status];
}

function channelLabel(channel: string) {
  if (channel === "email") return "E-Mail";
  if (channel === "internal") return "Intern";
  if (channel === "manual") return "Manuell";
  return "Sonstiges";
}

function directionLabel(direction: string) {
  if (direction === "outbound") return "Ausgehend";
  if (direction === "inbound") return "Eingehend";
  return "Intern";
}

function directionClass(direction: string) {
  if (direction === "outbound") return "bg-blue-500/10 text-blue-200";
  if (direction === "inbound") return "bg-emerald-500/10 text-emerald-200";
  return "bg-slate-800 text-slate-200";
}

function attachmentTypeLabel(type: CommunicationAttachment["type"]) {
  if (type === "letter_docx") return "Schreiben DOCX";
  if (type === "letter_pdf") return "Schreiben PDF";
  if (type === "calculation_report") return "Berechnungsbericht";
  if (type === "case_document") return "Falldokument";
  return "Anhang";
}

function stripHtml(value?: string) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

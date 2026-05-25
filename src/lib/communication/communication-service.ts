import type {
  CaseActivity,
  CommunicationAttachment,
  CommunicationChannel,
  CommunicationMessage,
  CommunicationMessageStatus,
  CommunicationParticipant,
  CommunicationThread,
  CommunicationThreadStatus,
  GeneratedLetterVersion,
  SavedCaseDocument,
  SavedCaseRecord,
  SavedGeneratedFile,
} from "@/types/case";
import { buildContactsFromCase, buildOrganizationsFromCase, normalizeContactKey, normalizeOrganizationKey } from "@/lib/crm/crm-service";
import { buildCommunicationAttachmentReference, normalizeCommunicationAttachment } from "@/lib/storage/communication-attachment-storage";
import type { CRMContactType } from "@/types/crm";

type CommunicationActor = {
  id?: string;
  name?: string;
};

type ThreadInput = {
  subject: string;
  channel?: CommunicationChannel;
  status?: CommunicationThreadStatus;
  participants?: CommunicationParticipant[];
  relatedContactIds?: string[];
  relatedOrganizationIds?: string[];
  metadata?: Record<string, unknown>;
  actor?: CommunicationActor | null;
};

type DraftMessageInput = {
  threadId?: string;
  subject?: string;
  channel?: CommunicationChannel;
  from?: CommunicationParticipant;
  to?: CommunicationParticipant[];
  cc?: CommunicationParticipant[];
  bcc?: CommunicationParticipant[];
  bodyText?: string;
  bodyHtml?: string;
  attachments?: CommunicationAttachment[];
  relatedLetterVersionId?: string;
  relatedContactIds?: string[];
  relatedOrganizationIds?: string[];
  provider?: CommunicationMessage["provider"];
  metadata?: Record<string, unknown>;
  actor?: CommunicationActor | null;
};

type LetterEmailDraftOptions = {
  threadId?: string;
  includeDocx?: boolean;
  includeReferencedAttachments?: boolean;
  actor?: CommunicationActor | null;
};

type MessageStatusOptions = {
  status: CommunicationMessageStatus;
  error?: string;
  sentAt?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  metadata?: Record<string, unknown>;
  actor?: CommunicationActor | null;
};

type DraftMessageUpdates = {
  to?: CommunicationParticipant[];
  cc?: CommunicationParticipant[];
  bcc?: CommunicationParticipant[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  metadata?: Record<string, unknown>;
  actor?: CommunicationActor | null;
};

type ManualSentOptions = {
  method?: "email" | "post" | "manual" | "other";
  note?: string;
  sentAt?: string;
  actor?: CommunicationActor | null;
};

export function listThreads(caseRecord: Pick<SavedCaseRecord, "communicationThreads">) {
  return [...(caseRecord.communicationThreads ?? [])].sort((a, b) => new Date(b.lastMessageAt || b.updatedAt).getTime() - new Date(a.lastMessageAt || a.updatedAt).getTime());
}

export function listMessages(caseRecord: Pick<SavedCaseRecord, "communicationThreads">) {
  return listThreads(caseRecord)
    .flatMap((thread) => thread.messages ?? [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createThread(caseRecord: SavedCaseRecord, input: ThreadInput): SavedCaseRecord {
  const now = new Date().toISOString();
  const thread: CommunicationThread = {
    id: createCommunicationId("thread"),
    caseId: caseRecord.id,
    subject: input.subject.trim() || "Kommunikation",
    channel: input.channel ?? "email",
    status: input.status ?? "open",
    participants: input.participants ?? [],
    messages: [],
    relatedContactIds: input.relatedContactIds,
    relatedOrganizationIds: input.relatedOrganizationIds,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    metadata: input.metadata,
  };

  return updateRecord(caseRecord, [thread, ...(caseRecord.communicationThreads ?? [])], now, [
    buildCommunicationActivity("communication_thread_created", "Kommunikations-Thread erstellt", {
      actor: input.actor,
      createdAt: now,
      metadata: { threadId: thread.id, channel: thread.channel, subject: thread.subject },
    }),
  ]);
}

export function createDraftMessage(caseRecord: SavedCaseRecord, input: DraftMessageInput): SavedCaseRecord {
  const now = new Date().toISOString();
  const threadId = input.threadId ?? createCommunicationId("thread");
  const existingThread = findThread(caseRecord, threadId);
  const subject = input.subject?.trim() || existingThread?.subject || "Nachricht";
  const channel = input.channel ?? existingThread?.channel ?? "email";
  const message = createMessage({
    id: createCommunicationId("message"),
    threadId,
    caseId: caseRecord.id,
    status: "draft",
    direction: channel === "internal" ? "internal" : "outbound",
    channel,
    from: input.from ?? internalParticipant(input.actor),
    to: input.to ?? [],
    cc: input.cc,
    bcc: input.bcc,
    subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    attachments: input.attachments,
    relatedLetterVersionId: input.relatedLetterVersionId,
    relatedContactIds: input.relatedContactIds,
    relatedOrganizationIds: input.relatedOrganizationIds,
    provider: input.provider ?? providerForChannel(channel),
    createdAt: now,
    createdBy: input.actor?.id,
    createdByName: input.actor?.name,
    metadata: input.metadata,
  });

  const nextRecord = existingThread
    ? addMessageToThread(caseRecord, threadId, message, { actor: input.actor, activityTitle: "Entwurf erstellt" })
    : addMessageToNewThread(caseRecord, {
        id: threadId,
        caseId: caseRecord.id,
        subject,
        channel,
        status: "open",
        participants: uniqueParticipants([message.from, ...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])]),
        messages: [message],
        relatedContactIds: unique([...(message.relatedContactIds ?? []), ...participantContactIds([message.from, ...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])])]),
        relatedOrganizationIds: unique([...(message.relatedOrganizationIds ?? []), ...participantOrganizationIds([message.from, ...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])])]),
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        metadata: { createdFromDraft: true },
      }, input.actor);

  return nextRecord;
}

export function createLetterEmailDraft(caseRecord: SavedCaseRecord, letterVersion: GeneratedLetterVersion, options: LetterEmailDraftOptions = {}): SavedCaseRecord {
  const attachments = buildLetterEmailAttachments(caseRecord, letterVersion, options);
  const subject = buildEmailSubject(caseRecord, letterVersion);
  const bodyText = buildEmailBody(caseRecord, letterVersion);
  const recipients = resolveLetterEmailRecipients(caseRecord);
  const relatedContactIds = participantContactIds(recipients);
  const relatedOrganizationIds = participantOrganizationIds(recipients);
  const nextRecord = createDraftMessage(caseRecord, {
    threadId: options.threadId ?? findLetterThread(caseRecord, letterVersion.id)?.id,
    subject,
    channel: "email",
    from: internalParticipant(options.actor),
    to: recipients,
    bodyText,
    attachments,
    relatedLetterVersionId: letterVersion.id,
    relatedContactIds,
    relatedOrganizationIds,
    provider: "manual",
    actor: options.actor,
    metadata: {
      source: "letter-email-draft",
      letterVersionId: letterVersion.id,
      letterVersion: letterVersion.version,
      attachmentCount: attachments.length,
    },
  });

  return {
    ...nextRecord,
    activityLog: [
      buildCommunicationActivity("communication_draft_created", "E-Mail-Entwurf erstellt", {
        actor: options.actor,
        metadata: { letterVersionId: letterVersion.id, letterVersion: letterVersion.version, subject },
      }),
      buildCommunicationActivity("communication_message_created", "Schreiben als E-Mail vorbereitet", {
        actor: options.actor,
        metadata: { letterVersionId: letterVersion.id, letterVersion: letterVersion.version },
      }),
      ...(attachments.length > 0
        ? [
            buildCommunicationActivity("communication_message_created", "Anlagen zur Nachricht hinzugefügt", {
              actor: options.actor,
              description: attachments.map((attachment) => attachment.label).join(", "),
              metadata: { attachmentCount: attachments.length, letterVersionId: letterVersion.id },
            }),
          ]
        : []),
      ...(nextRecord.activityLog ?? []),
    ],
  };
}

export function buildEmailSubject(caseRecord: SavedCaseRecord, letterVersion: GeneratedLetterVersion) {
  const address = cleanText(caseRecord.address || caseRecord.extracted.tenantFullAddress || caseRecord.extracted.tenantAddress);
  const tenant = cleanText(caseRecord.tenant || caseRecord.extracted.tenantName);
  const details = [address, tenant].filter(Boolean).join(" - ");
  const version = letterVersion.version ? ` (Version ${letterVersion.version})` : "";
  return `Vergleichsvorschlag betreffend ${details || "das Mietverhältnis"}${version}`;
}

export function buildEmailBody(caseRecord: SavedCaseRecord, letterVersion: GeneratedLetterVersion) {
  const recipient = cleanText(caseRecord.extracted.recipientName || caseRecord.extracted.landlord || caseRecord.extracted.opposingParty);
  const tenant = cleanText(caseRecord.tenant || caseRecord.extracted.tenantName);
  const address = cleanText(caseRecord.address || caseRecord.extracted.tenantFullAddress || caseRecord.extracted.tenantAddress);
  const attachments = buildLetterEmailAttachments(caseRecord, letterVersion);
  const attachmentNote = attachments.length > 0
    ? `Die dazugehörigen Unterlagen sind diesem Entwurf als Anlage vorbereitet (${attachments.map((attachment) => attachment.label).join(", ")}).`
    : "Die dazugehörigen Unterlagen können vor dem Versand noch ergänzt werden.";

  return [
    recipient ? `Sehr geehrte Damen und Herren,` : "Sehr geehrte Damen und Herren,",
    "",
    `anbei übermitteln wir den vorbereiteten Vergleichsvorschlag${tenant ? ` betreffend ${tenant}` : ""}${address ? `, ${address}` : ""}.`,
    "Das Schreiben beruht auf den derzeit im Fall gespeicherten Unterlagen und Berechnungsdaten.",
    attachmentNote,
    "",
    "Wir ersuchen um Prüfung und Rückmeldung.",
    "",
    "Mit freundlichen Grüßen",
  ].join("\n");
}

export function buildLetterEmailAttachments(caseRecord: SavedCaseRecord, letterVersion: GeneratedLetterVersion, options: Pick<LetterEmailDraftOptions, "includeDocx" | "includeReferencedAttachments"> = {}) {
  const attachments: CommunicationAttachment[] = [];

  if (letterVersion.pdf) {
    attachments.push(...attachGeneratedLetter(letterVersion, "pdf"));
  } else if (letterVersion.docx) {
    attachments.push(...attachGeneratedLetter(letterVersion, "docx"));
  }

  if (options.includeDocx && letterVersion.docx && letterVersion.pdf) {
    attachments.push(...attachGeneratedLetter(letterVersion, "docx"));
  }

  if (caseRecord.calculationReportPdf) {
    attachments.push(...attachCalculationReport(caseRecord, "pdf"));
  }
  if (caseRecord.calculationReportDocx) {
    attachments.push(...attachCalculationReport(caseRecord, "docx"));
  }

  if (options.includeReferencedAttachments ?? true) {
    const documentIds = new Set((letterVersion.attachments ?? []).map((attachment) => attachment.sourceDocumentId).filter(Boolean));
    for (const document of caseRecord.documents ?? []) {
      if (documentIds.has(document.id)) attachments.push(attachCaseDocument(document));
    }
  }

  return dedupeCommunicationAttachments(attachments);
}

export function addMessageToThread(
  caseRecord: SavedCaseRecord,
  threadId: string,
  message: CommunicationMessage,
  options: { actor?: CommunicationActor | null; activityTitle?: string } = {},
): SavedCaseRecord {
  const now = new Date().toISOString();
  const threads = caseRecord.communicationThreads ?? [];
  const thread = threads.find((item) => item.id === threadId);

  if (!thread) {
    throw new Error("Kommunikations-Thread wurde nicht gefunden.");
  }

  const normalizedMessage = normalizeMessage(message, caseRecord.id, thread.id, thread.channel);
  const nextThread: CommunicationThread = {
    ...thread,
    participants: uniqueParticipants([...thread.participants, normalizedMessage.from, ...normalizedMessage.to, ...(normalizedMessage.cc ?? []), ...(normalizedMessage.bcc ?? [])]),
    messages: [...(thread.messages ?? []), normalizedMessage],
    relatedContactIds: unique([...(thread.relatedContactIds ?? []), ...(normalizedMessage.relatedContactIds ?? []), ...participantContactIds([normalizedMessage.from, ...normalizedMessage.to, ...(normalizedMessage.cc ?? []), ...(normalizedMessage.bcc ?? [])])]),
    relatedOrganizationIds: unique([...(thread.relatedOrganizationIds ?? []), ...(normalizedMessage.relatedOrganizationIds ?? []), ...participantOrganizationIds([normalizedMessage.from, ...normalizedMessage.to, ...(normalizedMessage.cc ?? []), ...(normalizedMessage.bcc ?? [])])]),
    updatedAt: now,
    lastMessageAt: normalizedMessage.createdAt,
  };

  return updateRecord(caseRecord, replaceThread(threads, nextThread), now, [
    buildCommunicationActivity(activityTypeForMessage(normalizedMessage), options.activityTitle ?? activityTitleForMessage(normalizedMessage), {
      actor: options.actor,
      createdAt: now,
      metadata: { threadId, messageId: normalizedMessage.id, status: normalizedMessage.status, channel: normalizedMessage.channel },
    }),
  ]);
}

export function updateMessageStatus(
  caseRecord: SavedCaseRecord,
  threadId: string,
  messageId: string,
  options: MessageStatusOptions,
): SavedCaseRecord {
  const now = new Date().toISOString();
  let updatedMessage: CommunicationMessage | undefined;
  const threads = (caseRecord.communicationThreads ?? []).map((thread) => {
    if (thread.id !== threadId) return thread;
    const messages = (thread.messages ?? []).map((message) => {
      if (message.id !== messageId) return message;
      updatedMessage = {
        ...message,
        status: options.status,
        error: options.error,
        sentAt: options.status === "sent" ? options.sentAt ?? now : message.sentAt,
        providerMessageId: options.providerMessageId ?? message.providerMessageId,
        providerThreadId: options.providerThreadId ?? message.providerThreadId,
        metadata: { ...(message.metadata ?? {}), ...(options.metadata ?? {}) },
      };
      return updatedMessage;
    });

    return {
      ...thread,
      status: options.status === "archived" ? "archived" as const : thread.status,
      messages,
      updatedAt: now,
      lastMessageAt: updatedMessage?.createdAt ?? thread.lastMessageAt,
    };
  });

  if (!updatedMessage) {
    throw new Error("Kommunikations-Nachricht wurde nicht gefunden.");
  }

  return updateRecord(caseRecord, threads, now, [
    buildCommunicationActivity(activityTypeForStatus(options.status), activityTitleForStatus(options.status), {
      actor: options.actor,
      createdAt: now,
      description: options.error,
      metadata: { threadId, messageId, status: options.status, providerMessageId: options.providerMessageId },
    }),
  ]);
}

export function updateDraftMessage(caseRecord: SavedCaseRecord, threadId: string, messageId: string, updates: DraftMessageUpdates): SavedCaseRecord {
  const now = new Date().toISOString();
  let updatedMessage: CommunicationMessage | undefined;
  const threads = (caseRecord.communicationThreads ?? []).map((thread) => {
    if (thread.id !== threadId) return thread;

    const messages = (thread.messages ?? []).map((message) => {
      if (message.id !== messageId) return message;
      updatedMessage = {
        ...message,
        to: updates.to ?? message.to,
        cc: updates.cc ?? message.cc,
        bcc: updates.bcc ?? message.bcc,
        subject: updates.subject ?? message.subject,
        bodyText: updates.bodyText ?? message.bodyText,
        bodyHtml: updates.bodyHtml ?? message.bodyHtml,
        metadata: { ...(message.metadata ?? {}), ...(updates.metadata ?? {}), editedAt: now },
      };
      return updatedMessage;
    });

    return {
      ...thread,
      subject: updatedMessage?.subject || thread.subject,
      participants: updatedMessage ? uniqueParticipants([updatedMessage.from, ...updatedMessage.to, ...(updatedMessage.cc ?? []), ...(updatedMessage.bcc ?? [])]) : thread.participants,
      messages,
      updatedAt: now,
      lastMessageAt: now,
    };
  });

  if (!updatedMessage) {
    throw new Error("Kommunikations-Nachricht wurde nicht gefunden.");
  }

  return updateRecord(caseRecord, threads, now, [
    buildCommunicationActivity("communication_message_created", "Entwurf bearbeitet", {
      actor: updates.actor,
      createdAt: now,
      metadata: { threadId, messageId, status: updatedMessage.status },
    }),
  ]);
}

export function markMessageReady(caseRecord: SavedCaseRecord, threadId: string, messageId: string, actor?: CommunicationActor | null): SavedCaseRecord {
  return updateMessageStatusWithTitle(caseRecord, threadId, messageId, { status: "ready", actor }, "Nachricht bereitgestellt");
}

export function markMessageSentManual(caseRecord: SavedCaseRecord, threadId: string, messageId: string, options: ManualSentOptions = {}): SavedCaseRecord {
  const now = options.sentAt ?? new Date().toISOString();
  const nextRecord = updateMessageStatusWithTitle(
    caseRecord,
    threadId,
    messageId,
    {
      status: "sent",
      sentAt: now,
      actor: options.actor,
      metadata: { manualSentMethod: options.method ?? "manual", manualSentNote: options.note },
    },
    "Nachricht manuell als versendet markiert",
    options.note,
  );
  const sentMessage = findMessage(nextRecord, threadId, messageId);

  if (!sentMessage?.relatedLetterVersionId || !nextRecord.generatedLetters?.length) return nextRecord;

  return {
    ...nextRecord,
    generatedLetters: nextRecord.generatedLetters.map((letter) => {
      if (letter.id !== sentMessage.relatedLetterVersionId) return letter;
      return {
        ...letter,
        status: letter.status === "archived" || letter.status === "outdated" ? letter.status : "sent",
        sent: {
          sentAt: now,
          sentBy: options.actor?.id,
          sentByName: options.actor?.name,
          method: options.method ?? "manual",
          note: options.note,
        },
        statusHistory: [
          {
            id: createCommunicationId("activity"),
            status: "sent",
            changedAt: now,
            changedBy: options.actor?.id,
            changedByName: options.actor?.name,
            note: "Über Kommunikationshistorie als versendet markiert",
          },
          ...(letter.statusHistory ?? []),
        ],
      };
    }),
  };
}

export function markMessageFailed(caseRecord: SavedCaseRecord, threadId: string, messageId: string, error?: string, actor?: CommunicationActor | null): SavedCaseRecord {
  return updateMessageStatusWithTitle(caseRecord, threadId, messageId, { status: "failed", error, actor }, "Nachricht fehlgeschlagen", error);
}

export function archiveMessage(caseRecord: SavedCaseRecord, threadId: string, messageId: string, actor?: CommunicationActor | null): SavedCaseRecord {
  return updateMessageStatusWithTitle(caseRecord, threadId, messageId, { status: "archived", actor }, "Nachricht archiviert");
}

export function archiveThread(caseRecord: SavedCaseRecord, threadId: string, actor?: CommunicationActor | null): SavedCaseRecord {
  const now = new Date().toISOString();
  let archived = false;
  const threads = (caseRecord.communicationThreads ?? []).map((thread) => {
    if (thread.id !== threadId) return thread;
    archived = true;
    return {
      ...thread,
      status: "archived" as const,
      messages: (thread.messages ?? []).map((message) => ({ ...message, status: message.status === "sent" || message.status === "received" ? message.status : "archived" as const })),
      updatedAt: now,
    };
  });

  if (!archived) {
    throw new Error("Kommunikations-Thread wurde nicht gefunden.");
  }

  return updateRecord(caseRecord, threads, now, [
    buildCommunicationActivity("communication_message_archived", "Kommunikations-Thread archiviert", {
      actor,
      createdAt: now,
      metadata: { threadId },
    }),
  ]);
}

export function attachGeneratedLetter(letter: GeneratedLetterVersion, format: "docx" | "pdf" | "both" = "both"): CommunicationAttachment[] {
  const attachments: CommunicationAttachment[] = [];
  if ((format === "docx" || format === "both") && letter.docx) {
    attachments.push(generatedLetterAttachment(letter, "docx", letter.docx));
  }
  if ((format === "pdf" || format === "both") && letter.pdf) {
    attachments.push(generatedLetterAttachment(letter, "pdf", letter.pdf));
  }
  return attachments;
}

export function attachCalculationReport(caseRecord: SavedCaseRecord, format: "docx" | "pdf" | "both" = "both"): CommunicationAttachment[] {
  const attachments: CommunicationAttachment[] = [];
  if ((format === "docx" || format === "both") && caseRecord.calculationReportDocx) {
    const attachment = buildCommunicationAttachmentReference(caseRecord, { type: "calculation-report", format: "docx" });
    if (attachment) attachments.push(attachment);
  }
  if ((format === "pdf" || format === "both") && caseRecord.calculationReportPdf) {
    const attachment = buildCommunicationAttachmentReference(caseRecord, { type: "calculation-report", format: "pdf" });
    if (attachment) attachments.push(attachment);
  }
  return attachments;
}

export function attachCaseDocument(document: SavedCaseDocument): CommunicationAttachment {
  return normalizeCommunicationAttachment({
    id: createCommunicationId("attachment"),
    type: "case_document",
    label: document.type,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    storage: document.storage,
    storageStatus: document.storageStatus,
    sourceDocumentId: document.id,
    source: "reference",
    metadata: {
      documentType: document.type,
      extractionStatus: document.extractionStatus,
    },
  });
}

function addMessageToNewThread(caseRecord: SavedCaseRecord, thread: CommunicationThread, actor?: CommunicationActor | null) {
  const now = new Date().toISOString();
  return updateRecord(caseRecord, [thread, ...(caseRecord.communicationThreads ?? [])], now, [
    buildCommunicationActivity("communication_thread_created", "Kommunikations-Thread erstellt", {
      actor,
      createdAt: now,
      metadata: { threadId: thread.id, channel: thread.channel, subject: thread.subject },
    }),
    buildCommunicationActivity("communication_draft_created", "Entwurf erstellt", {
      actor,
      createdAt: now,
      metadata: { threadId: thread.id, messageId: thread.messages?.[0]?.id, channel: thread.channel },
    }),
  ]);
}

function updateRecord(caseRecord: SavedCaseRecord, communicationThreads: CommunicationThread[], updatedAt: string, activities: CaseActivity[]): SavedCaseRecord {
  return {
    ...caseRecord,
    communicationThreads,
    updatedAt,
    lastActivity: formatActivityDate(updatedAt),
    activityLog: [...activities, ...(caseRecord.activityLog ?? [])],
  };
}

function findThread(caseRecord: Pick<SavedCaseRecord, "communicationThreads">, threadId: string) {
  return (caseRecord.communicationThreads ?? []).find((thread) => thread.id === threadId);
}

function findMessage(caseRecord: Pick<SavedCaseRecord, "communicationThreads">, threadId: string, messageId: string) {
  return findThread(caseRecord, threadId)?.messages?.find((message) => message.id === messageId);
}

function updateMessageStatusWithTitle(
  caseRecord: SavedCaseRecord,
  threadId: string,
  messageId: string,
  options: MessageStatusOptions,
  title: string,
  description?: string,
): SavedCaseRecord {
  const now = new Date().toISOString();
  let updatedMessage: CommunicationMessage | undefined;
  const threads = (caseRecord.communicationThreads ?? []).map((thread) => {
    if (thread.id !== threadId) return thread;
    const messages = (thread.messages ?? []).map((message) => {
      if (message.id !== messageId) return message;
      updatedMessage = {
        ...message,
        status: options.status,
        error: options.error,
        sentAt: options.status === "sent" ? options.sentAt ?? now : message.sentAt,
        providerMessageId: options.providerMessageId ?? message.providerMessageId,
        providerThreadId: options.providerThreadId ?? message.providerThreadId,
        metadata: { ...(message.metadata ?? {}), ...(options.metadata ?? {}) },
      };
      return updatedMessage;
    });

    return {
      ...thread,
      status: options.status === "archived" ? "archived" as const : options.status === "sent" ? "closed" as const : thread.status,
      messages,
      updatedAt: now,
      lastMessageAt: updatedMessage?.createdAt ?? thread.lastMessageAt,
    };
  });

  if (!updatedMessage) {
    throw new Error("Kommunikations-Nachricht wurde nicht gefunden.");
  }

  return updateRecord(caseRecord, threads, now, [
    buildCommunicationActivity(activityTypeForStatus(options.status), title, {
      actor: options.actor,
      createdAt: now,
      description,
      metadata: { threadId, messageId, status: options.status, providerMessageId: options.providerMessageId },
    }),
  ]);
}

function replaceThread(threads: CommunicationThread[], nextThread: CommunicationThread) {
  return threads.map((thread) => (thread.id === nextThread.id ? nextThread : thread));
}

function normalizeMessage(message: CommunicationMessage, caseId: string, threadId: string, fallbackChannel: CommunicationChannel): CommunicationMessage {
  const now = new Date().toISOString();
  return {
    ...message,
    id: message.id || createCommunicationId("message"),
    caseId,
    threadId,
    channel: message.channel ?? fallbackChannel,
    createdAt: message.createdAt || now,
    attachments: (message.attachments ?? []).map(normalizeCommunicationAttachment),
    relatedContactIds: unique(message.relatedContactIds ?? []),
    relatedOrganizationIds: unique(message.relatedOrganizationIds ?? []),
  };
}

function createMessage(message: CommunicationMessage) {
  return message;
}

function generatedLetterAttachment(letter: GeneratedLetterVersion, format: "docx" | "pdf", file: SavedGeneratedFile): CommunicationAttachment {
  return normalizeCommunicationAttachment({
    id: createCommunicationId("attachment"),
    type: format === "docx" ? "letter_docx" : "letter_pdf",
    label: `Vergleichsschreiben Version ${letter.version} ${format.toUpperCase()}`,
    fileName: file.fileName,
    mimeType: file.mimeType,
    storage: file.storage,
    storageStatus: file.storageStatus,
    sourceLetterVersionId: letter.id,
    source: "reference",
    metadata: { generatedAt: file.generatedAt, format },
  });
}

function findLetterThread(caseRecord: Pick<SavedCaseRecord, "communicationThreads">, letterVersionId: string) {
  return (caseRecord.communicationThreads ?? []).find((thread) =>
    (thread.messages ?? []).some((message) => message.relatedLetterVersionId === letterVersionId),
  );
}

function resolveLetterEmailRecipients(caseRecord: SavedCaseRecord): CommunicationParticipant[] {
  const extracted = caseRecord.extracted as Record<string, unknown>;
  const recipientCandidates: CommunicationParticipant[] = [
    {
      name: stringValue(extracted.representation ?? extracted.landlordRepresentedBy),
      email: firstEmail(extracted.representationEmail, extracted.vertretungEmail, extracted.landlordRepresentedByEmail),
      type: "representation",
      ...resolveCrmParticipantReference(caseRecord, "representation", stringValue(extracted.representation ?? extracted.landlordRepresentedBy), firstEmail(extracted.representationEmail, extracted.vertretungEmail, extracted.landlordRepresentedByEmail)),
    },
    {
      name: stringValue(extracted.landlord),
      email: firstEmail(extracted.landlordEmail, extracted.vermieterEmail),
      type: "landlord",
      ...resolveCrmParticipantReference(caseRecord, "landlord", stringValue(extracted.landlord), firstEmail(extracted.landlordEmail, extracted.vermieterEmail)),
    },
    {
      name: stringValue(extracted.recipientName ?? extracted.opposingParty),
      email: firstEmail(extracted.recipientEmail, extracted.empfaengerEmail, extracted.opposingPartyEmail),
      type: "other",
      ...resolveCrmParticipantReference(caseRecord, "other", stringValue(extracted.recipientName ?? extracted.opposingParty), firstEmail(extracted.recipientEmail, extracted.empfaengerEmail, extracted.opposingPartyEmail)),
    },
  ];

  const withEmail = recipientCandidates.find((participant) => participant.email);
  if (withEmail) return [withEmail];

  const withName = recipientCandidates.find((participant) => participant.name);
  return withName ? [withName] : [];
}

function resolveCrmParticipantReference(caseRecord: SavedCaseRecord, type: CRMContactType | "other", name?: string, email?: string): Pick<CommunicationParticipant, "contactId" | "organizationId"> {
  const contactKey = normalizeContactKey({
    displayName: name ?? "",
    email,
    address: undefined,
    postalCode: undefined,
    city: undefined,
  });
  const contact = buildContactsFromCase(caseRecord).find((item) => {
    if (type !== "other" && item.type !== type) return false;
    if (email && item.email === email.toLowerCase()) return true;
    return contactKey && normalizeContactKey(item) === contactKey;
  });
  const organizationKey = normalizeOrganizationKey({
    name: name ?? "",
    email,
    address: undefined,
    postalCode: undefined,
    city: undefined,
  });
  const organization = buildOrganizationsFromCase(caseRecord).find((item) => {
    if (email && item.email === email.toLowerCase()) return true;
    return organizationKey && normalizeOrganizationKey(item) === organizationKey;
  });
  return {
    contactId: contact?.id,
    organizationId: organization?.id,
  };
}

function internalParticipant(actor?: CommunicationActor | null): CommunicationParticipant {
  return {
    name: actor?.name,
    role: "MAWA",
    type: "internal",
  };
}

function providerForChannel(channel: CommunicationChannel): CommunicationMessage["provider"] {
  if (channel === "email") return "manual";
  if (channel === "internal") return "internal";
  return channel;
}

function activityTypeForMessage(message: CommunicationMessage): CaseActivity["type"] {
  if (message.status === "draft") return "communication_draft_created";
  if (message.status === "received") return "communication_message_received";
  if (message.status === "failed") return "communication_send_failed";
  return "communication_message_created";
}

function activityTitleForMessage(message: CommunicationMessage) {
  if (message.status === "draft") return "Entwurf erstellt";
  if (message.status === "received") return "Nachricht empfangen";
  if (message.status === "failed") return "Versand fehlgeschlagen";
  return "Nachricht erstellt";
}

function activityTypeForStatus(status: CommunicationMessageStatus): CaseActivity["type"] {
  if (status === "archived") return "communication_message_archived";
  if (status === "failed") return "communication_send_failed";
  if (status === "received") return "communication_message_received";
  if (status === "draft") return "communication_draft_created";
  return "communication_message_created";
}

function activityTitleForStatus(status: CommunicationMessageStatus) {
  if (status === "archived") return "Nachricht archiviert";
  if (status === "failed") return "Versand fehlgeschlagen";
  if (status === "received") return "Nachricht empfangen";
  if (status === "draft") return "Entwurf erstellt";
  if (status === "sent") return "Nachricht als versendet markiert";
  return "Nachricht aktualisiert";
}

function buildCommunicationActivity(
  type: CaseActivity["type"],
  title: string,
  options: {
    actor?: CommunicationActor | null;
    description?: string;
    createdAt?: string;
    metadata?: Record<string, unknown>;
  } = {},
): CaseActivity {
  return {
    id: createCommunicationId("activity"),
    type,
    title,
    description: options.description,
    userId: options.actor?.id,
    userName: options.actor?.name,
    createdAt: options.createdAt ?? new Date().toISOString(),
    metadata: options.metadata,
  };
}

function uniqueParticipants(participants: CommunicationParticipant[]) {
  const seen = new Set<string>();
  return participants.filter((participant) => {
    const key = `${participant.contactId ?? ""}:${participant.organizationId ?? ""}:${participant.type ?? "other"}:${participant.email ?? participant.name ?? participant.role ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(participant.name || participant.email || participant.role);
  });
}

function participantContactIds(participants: CommunicationParticipant[]) {
  return unique(participants.map((participant) => participant.contactId));
}

function participantOrganizationIds(participants: CommunicationParticipant[]) {
  return unique(participants.map((participant) => participant.organizationId));
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function dedupeCommunicationAttachments(attachments: CommunicationAttachment[]) {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.type}:${attachment.sourceLetterVersionId ?? attachment.sourceDocumentId ?? attachment.fileName ?? attachment.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function stringValue(value: unknown) {
  const text = cleanText(value);
  return text || undefined;
}

function firstEmail(...values: unknown[]) {
  for (const value of values) {
    const email = extractEmail(value);
    if (email) return email;
  }
  return undefined;
}

function extractEmail(value: unknown) {
  const text = cleanText(value);
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0];
}

function createCommunicationId(prefix: "thread" | "message" | "attachment" | "activity") {
  return `comm_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

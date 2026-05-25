"use client";

import type { SavedCaseRecord } from "@/types/case";
import type { CRMCaseLink, CRMCaseLinkRole, CRMCaseLinkSource, CRMContact, CRMContactType, CRMOrganization, CRMOrganizationType } from "@/types/crm";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendar/calendar-service";
import { CaseService } from "@/lib/case-service";
import type { CaseTask, CommunicationMessage, CommunicationThread, GeneratedLetterVersion } from "@/types/case";

const contactsKey = "mietpilot-crm-contacts";
const organizationsKey = "mietpilot-crm-organizations";
const linksKey = "mietpilot-crm-links";

type ContactInput = Omit<CRMContact, "id" | "createdAt" | "updatedAt"> & Partial<Pick<CRMContact, "id" | "createdAt" | "updatedAt">>;
type OrganizationInput = Omit<CRMOrganization, "id" | "createdAt" | "updatedAt"> & Partial<Pick<CRMOrganization, "id" | "createdAt" | "updatedAt">>;
type CaseLinkInput = Omit<CRMCaseLink, "id" | "createdAt"> & Partial<Pick<CRMCaseLink, "id" | "createdAt">>;
type ContactUpdate = Partial<Omit<CRMContact, "id" | "createdAt" | "updatedAt">>;
type OrganizationUpdate = Partial<Omit<CRMOrganization, "id" | "createdAt" | "updatedAt">>;

export type CRMActivityFeedItem = {
  id: string;
  type:
    | "communication_created"
    | "communication_sent"
    | "communication_failed"
    | "letter_generated"
    | "letter_sent"
    | "task_created"
    | "task_completed"
    | "calendar_created"
    | "calendar_completed"
    | "review_warning";
  title: string;
  timestamp: string;
  relatedCaseId: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
};

export const CRMService = {
  listContacts,
  listOrganizations,
  listCaseLinks,
  createContact,
  updateContact,
  createOrganization,
  updateOrganization,
  linkContactToCase,
  linkOrganizationToCase,
  unlinkCaseLink,
  findTasksByContact,
  findTasksByOrganization,
  findCalendarEventsByContact,
  findCalendarEventsByOrganization,
  findCommunicationByContact,
  findCommunicationByOrganization,
  buildCrmActivityFeed,
  saveContact,
  saveOrganization,
  saveCaseLink,
  getContact,
  getOrganization,
  deleteContact,
  deleteOrganization,
  findContactsByCase,
  findOrganizationsByCase,
  buildContactsFromCase,
  buildOrganizationsFromCase,
  buildCaseLinksFromCase,
  normalizeContactKey,
  normalizeOrganizationKey,
};

export function listContacts(): CRMContact[] {
  return readStorage<CRMContact>(contactsKey).map(normalizeContact).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function listOrganizations(): CRMOrganization[] {
  return readStorage<CRMOrganization>(organizationsKey).map(normalizeOrganization).sort((a, b) => a.name.localeCompare(b.name));
}

export function listCaseLinks(): CRMCaseLink[] {
  return readStorage<CRMCaseLink>(linksKey).map(normalizeCaseLink);
}

export function createContact(input: ContactInput): CRMContact {
  return saveContact(input);
}

export function updateContact(id: string, updates: ContactUpdate): CRMContact {
  const now = new Date().toISOString();
  const contacts = listContacts();
  const existing = contacts.find((contact) => contact.id === id);
  if (!existing) throw new Error("Kontakt wurde nicht gefunden.");

  const updated = normalizeContact({
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
  });
  const duplicate = contacts.find((contact) => contact.id !== id && normalizeContactKey(contact) === normalizeContactKey(updated));
  if (duplicate) {
    const merged = mergeContactPreferIncoming(duplicate, updated, now);
    writeStorage(contactsKey, contacts.filter((contact) => contact.id !== id).map((contact) => (contact.id === duplicate.id ? merged : contact)));
    writeStorage(linksKey, listCaseLinks().map((link) => (link.contactId === id ? { ...link, contactId: duplicate.id } : link)));
    return merged;
  }

  writeStorage(contactsKey, contacts.map((contact) => (contact.id === id ? updated : contact)));
  return updated;
}

export function createOrganization(input: OrganizationInput): CRMOrganization {
  return saveOrganization(input);
}

export function updateOrganization(id: string, updates: OrganizationUpdate): CRMOrganization {
  const now = new Date().toISOString();
  const organizations = listOrganizations();
  const existing = organizations.find((organization) => organization.id === id);
  if (!existing) throw new Error("Organisation wurde nicht gefunden.");

  const updated = normalizeOrganization({
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
  });
  const duplicate = organizations.find((organization) => organization.id !== id && normalizeOrganizationKey(organization) === normalizeOrganizationKey(updated));
  if (duplicate) {
    const merged = mergeOrganizationPreferIncoming(duplicate, updated, now);
    writeStorage(organizationsKey, organizations.filter((organization) => organization.id !== id).map((organization) => (organization.id === duplicate.id ? merged : organization)));
    writeStorage(linksKey, listCaseLinks().map((link) => (link.organizationId === id ? { ...link, organizationId: duplicate.id } : link)));
    writeStorage(contactsKey, listContacts().map((contact) => (contact.organizationId === id ? { ...contact, organizationId: duplicate.id } : contact)));
    return merged;
  }

  writeStorage(organizationsKey, organizations.map((organization) => (organization.id === id ? updated : organization)));
  return updated;
}

export function linkContactToCase(contactId: string, caseId: string, role: CRMCaseLinkRole, source: CRMCaseLinkSource = "manual") {
  const contact = getContact(contactId);
  if (!contact) throw new Error("Kontakt wurde nicht gefunden.");
  const savedContact = updateContact(contactId, { linkedCaseIds: unique([...(contact.linkedCaseIds ?? []), caseId]) });
  return saveCaseLink({
    caseId,
    contactId: savedContact.id,
    role,
    source,
    primary: role === "tenant",
  });
}

export function linkOrganizationToCase(organizationId: string, caseId: string, role: CRMCaseLinkRole, source: CRMCaseLinkSource = "manual") {
  const organization = getOrganization(organizationId);
  if (!organization) throw new Error("Organisation wurde nicht gefunden.");
  const savedOrganization = updateOrganization(organizationId, { linkedCaseIds: unique([...(organization.linkedCaseIds ?? []), caseId]) });
  return saveCaseLink({
    caseId,
    organizationId: savedOrganization.id,
    role,
    source,
    primary: role === "landlord",
  });
}

export function unlinkCaseLink(linkId: string) {
  const link = listCaseLinks().find((item) => item.id === linkId);
  writeStorage(linksKey, listCaseLinks().filter((item) => item.id !== linkId));
  if (link?.contactId) {
    const remainingCaseIds = listCaseLinks().filter((item) => item.contactId === link.contactId).map((item) => item.caseId);
    writeStorage(contactsKey, listContacts().map((contact) => (contact.id === link.contactId ? { ...contact, linkedCaseIds: unique([...(contact.linkedCaseIds ?? []).filter((caseId) => caseId !== link.caseId), ...remainingCaseIds]) } : contact)));
  }
  if (link?.organizationId) {
    const remainingCaseIds = listCaseLinks().filter((item) => item.organizationId === link.organizationId).map((item) => item.caseId);
    writeStorage(organizationsKey, listOrganizations().map((organization) => (organization.id === link.organizationId ? { ...organization, linkedCaseIds: unique([...(organization.linkedCaseIds ?? []).filter((caseId) => caseId !== link.caseId), ...remainingCaseIds]) } : organization)));
  }
}

export function findTasksByContact(contactId: string, records: SavedCaseRecord[] = CaseService.list()) {
  return records.flatMap((record) => (record.caseTasks ?? []).filter((task) => task.contactId === contactId).map((task) => ({ record, task })));
}

export function findTasksByOrganization(organizationId: string, records: SavedCaseRecord[] = CaseService.list()) {
  return records.flatMap((record) => (record.caseTasks ?? []).filter((task) => task.organizationId === organizationId).map((task) => ({ record, task })));
}

export function findCalendarEventsByContact(contactId: string, records: SavedCaseRecord[] = CaseService.list()) {
  return listCalendarEvents(records).filter((event) => event.contactId === contactId);
}

export function findCalendarEventsByOrganization(organizationId: string, records: SavedCaseRecord[] = CaseService.list()) {
  return listCalendarEvents(records).filter((event) => event.organizationId === organizationId);
}

export function findCommunicationByContact(contactId: string, records: SavedCaseRecord[] = CaseService.list()) {
  return records.flatMap((record) => findCommunicationRows(record, (thread, message) => communicationMatchesContact(thread, message, contactId)));
}

export function findCommunicationByOrganization(organizationId: string, records: SavedCaseRecord[] = CaseService.list()) {
  return records.flatMap((record) => findCommunicationRows(record, (thread, message) => communicationMatchesOrganization(thread, message, organizationId)));
}

export function buildCrmActivityFeed(
  target: { contactId?: string; organizationId?: string },
  records: SavedCaseRecord[] = CaseService.list(),
): CRMActivityFeedItem[] {
  const relatedCaseIds = getRelatedCaseIds(target);
  for (const record of records) {
    if (target.contactId && buildContactsFromCase(record).some((contact) => contact.id === target.contactId)) relatedCaseIds.add(record.id);
    if (target.organizationId && buildOrganizationsFromCase(record).some((organization) => organization.id === target.organizationId)) relatedCaseIds.add(record.id);
  }
  const inScope = records.filter((record) => relatedCaseIds.has(record.id) || recordHasExplicitCrmReference(record, target));
  const items: CRMActivityFeedItem[] = [];

  for (const record of inScope) {
    for (const row of findCommunicationRows(record, (thread, message) => crmCommunicationMatches(thread, message, target))) {
      if (row.message) items.push(...communicationActivityItems(record.id, row.thread, row.message));
    }

    for (const letter of record.generatedLetters ?? []) {
      items.push(...letterActivityItems(record.id, letter, target));
    }

    for (const task of record.caseTasks ?? []) {
      if (isCalendarTaskType(task.type)) continue;
      if (!crmTaskMatches(task, target) && !relatedCaseIds.has(record.id)) continue;
      items.push(taskActivityItem(record.id, task));
    }

    for (const event of listCalendarEvents([record])) {
      if (!crmCalendarMatches(event, target) && !relatedCaseIds.has(record.id)) continue;
      items.push(calendarActivityItem(event));
    }

    for (const change of record.pendingExtractedChanges ?? []) {
      items.push({
        id: `crm_activity_review_${record.id}_${change.field}`,
        type: "review_warning",
        title: `Ungeprüfte Änderung: ${change.label}`,
        timestamp: record.updatedAt,
        relatedCaseId: record.id,
        relatedEntityId: change.sourceDocumentId,
        metadata: { field: change.field, sourceDocumentType: change.sourceDocumentType },
      });
    }
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function saveContact(input: ContactInput): CRMContact {
  const now = new Date().toISOString();
  const contacts = listContacts();
  const contact = normalizeContact({
    ...input,
    id: input.id ?? createCrmId("contact"),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });
  const duplicate = contacts.find((item) => item.id !== contact.id && normalizeContactKey(item) === normalizeContactKey(contact));
  const nextContact = duplicate ? mergeContact(duplicate, contact, now) : contact;
  const next = duplicate
    ? contacts.map((item) => (item.id === duplicate.id ? nextContact : item))
    : contacts.some((item) => item.id === contact.id)
      ? contacts.map((item) => (item.id === contact.id ? nextContact : item))
      : [nextContact, ...contacts];
  writeStorage(contactsKey, next);
  return nextContact;
}

export function saveOrganization(input: OrganizationInput): CRMOrganization {
  const now = new Date().toISOString();
  const organizations = listOrganizations();
  const organization = normalizeOrganization({
    ...input,
    id: input.id ?? createCrmId("org"),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });
  const duplicate = organizations.find((item) => item.id !== organization.id && normalizeOrganizationKey(item) === normalizeOrganizationKey(organization));
  const nextOrganization = duplicate ? mergeOrganization(duplicate, organization, now) : organization;
  const next = duplicate
    ? organizations.map((item) => (item.id === duplicate.id ? nextOrganization : item))
    : organizations.some((item) => item.id === organization.id)
      ? organizations.map((item) => (item.id === organization.id ? nextOrganization : item))
      : [nextOrganization, ...organizations];
  writeStorage(organizationsKey, next);
  return nextOrganization;
}

export function saveCaseLink(input: CaseLinkInput): CRMCaseLink {
  const links = listCaseLinks();
  const link = normalizeCaseLink({
    ...input,
    id: input.id ?? createCrmId("link"),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  const duplicate = links.find((item) => caseLinkKey(item) === caseLinkKey(link));
  const next = duplicate ? links.map((item) => (item.id === duplicate.id ? { ...link, id: duplicate.id, createdAt: duplicate.createdAt } : item)) : [link, ...links];
  writeStorage(linksKey, next);
  const savedLink = duplicate ? { ...link, id: duplicate.id, createdAt: duplicate.createdAt } : link;
  syncLinkedCaseIdsForLink(savedLink);
  return savedLink;
}

export function getContact(id: string) {
  return listContacts().find((contact) => contact.id === id);
}

export function getOrganization(id: string) {
  return listOrganizations().find((organization) => organization.id === id);
}

export function deleteContact(id: string) {
  writeStorage(contactsKey, listContacts().filter((contact) => contact.id !== id));
  writeStorage(linksKey, listCaseLinks().filter((link) => link.contactId !== id));
}

export function deleteOrganization(id: string) {
  writeStorage(organizationsKey, listOrganizations().filter((organization) => organization.id !== id));
  writeStorage(contactsKey, listContacts().map((contact) => (contact.organizationId === id ? { ...contact, organizationId: undefined } : contact)));
  writeStorage(linksKey, listCaseLinks().filter((link) => link.organizationId !== id));
}

export function findContactsByCase(caseId: string) {
  const contactIds = new Set(listCaseLinks().filter((link) => link.caseId === caseId && link.contactId).map((link) => link.contactId));
  return listContacts().filter((contact) => contact.linkedCaseIds?.includes(caseId) || contactIds.has(contact.id));
}

export function findOrganizationsByCase(caseId: string) {
  const organizationIds = new Set(listCaseLinks().filter((link) => link.caseId === caseId && link.organizationId).map((link) => link.organizationId));
  return listOrganizations().filter((organization) => organization.linkedCaseIds?.includes(caseId) || organizationIds.has(organization.id));
}

export function buildContactsFromCase(caseRecord: SavedCaseRecord): CRMContact[] {
  const extracted = caseRecord.extracted as Record<string, unknown>;
  const contacts: CRMContact[] = [];
  const now = new Date().toISOString();

  pushContact(contacts, {
    type: "tenant",
    displayName: stringValue(caseRecord.tenant) || stringValue(extracted.tenantName),
    phone: stringValue(extracted.phone),
    address: stringValue(caseRecord.address) || stringValue(extracted.tenantFullAddress) || stringValue(extracted.tenantAddress),
    postalCode: stringValue(extracted.tenantPostalCode),
    city: stringValue(extracted.tenantCity),
    linkedCaseIds: [caseRecord.id],
    tags: ["mieter"],
    now,
  });

  pushContact(contacts, {
    type: "landlord",
    displayName: stringValue(extracted.landlord),
    email: firstEmail(extracted.landlordEmail, extracted.vermieterEmail),
    address: stringValue(extracted.landlordAddress),
    city: stringValue(extracted.landlordPostalCity),
    linkedCaseIds: [caseRecord.id],
    tags: ["vermieter"],
    now,
  });

  pushContact(contacts, {
    type: "opponent",
    displayName: stringValue(extracted.opposingParty),
    email: firstEmail(extracted.opposingPartyEmail),
    linkedCaseIds: [caseRecord.id],
    tags: ["antragsgegner"],
    now,
  });

  pushContact(contacts, {
    type: "representation",
    displayName: stringValue(extracted.representation ?? extracted.landlordRepresentedBy),
    email: firstEmail(extracted.representationEmail, extracted.vertretungEmail, extracted.landlordRepresentedByEmail),
    linkedCaseIds: [caseRecord.id],
    tags: ["vertretung"],
    now,
  });

  pushContact(contacts, {
    type: "other",
    displayName: stringValue(extracted.recipientName),
    email: firstEmail(extracted.recipientEmail, extracted.empfaengerEmail),
    address: stringValue(extracted.recipientAddress),
    city: stringValue(extracted.recipientPostalCity),
    linkedCaseIds: [caseRecord.id],
    tags: ["empfaenger"],
    now,
  });

  pushContact(contacts, {
    type: "internal",
    displayName: stringValue(extracted.caseWorker) || stringValue(caseRecord.ownerName),
    linkedCaseIds: [caseRecord.id],
    tags: ["sachbearbeitung"],
    now,
  });

  for (const participant of (caseRecord.communicationThreads ?? []).flatMap((thread) => thread.participants)) {
    pushContact(contacts, {
      type: mapParticipantType(participant.type),
      displayName: stringValue(participant.name) || stringValue(participant.email) || stringValue(participant.role),
      email: firstEmail(participant.email),
      linkedCaseIds: [caseRecord.id],
      tags: ["kommunikation"],
      now,
    });
  }

  return dedupeContacts(contacts);
}

export function buildOrganizationsFromCase(caseRecord: SavedCaseRecord): CRMOrganization[] {
  const extracted = caseRecord.extracted as Record<string, unknown>;
  const organizations: CRMOrganization[] = [];
  const now = new Date().toISOString();

  pushOrganization(organizations, {
    type: "landlord_company",
    name: stringValue(extracted.landlord),
    email: firstEmail(extracted.landlordEmail, extracted.vermieterEmail),
    address: stringValue(extracted.landlordAddress),
    city: stringValue(extracted.landlordPostalCity),
    linkedCaseIds: [caseRecord.id],
    tags: ["vermieter"],
    now,
  });

  pushOrganization(organizations, {
    type: inferRepresentationOrganizationType(stringValue(extracted.representation ?? extracted.landlordRepresentedBy)),
    name: stringValue(extracted.representation ?? extracted.landlordRepresentedBy),
    email: firstEmail(extracted.representationEmail, extracted.vertretungEmail, extracted.landlordRepresentedByEmail),
    linkedCaseIds: [caseRecord.id],
    tags: ["vertretung"],
    now,
  });

  pushOrganization(organizations, {
    type: "company",
    name: stringValue(extracted.opposingParty),
    email: firstEmail(extracted.opposingPartyEmail),
    linkedCaseIds: [caseRecord.id],
    tags: ["antragsgegner"],
    now,
  });

  return dedupeOrganizations(organizations);
}

export function buildCaseLinksFromCase(caseRecord: SavedCaseRecord): CRMCaseLink[] {
  const now = new Date().toISOString();
  const contacts = buildContactsFromCase(caseRecord);
  const organizations = buildOrganizationsFromCase(caseRecord);
  const links: CRMCaseLink[] = [];

  for (const contact of contacts) {
    const role = contactRole(contact.type, contact.tags);
    links.push({
      id: createStableLinkId(caseRecord.id, role, contact.id),
      caseId: caseRecord.id,
      contactId: contact.id,
      role,
      source: contact.tags?.includes("kommunikation") ? "communication" : "extracted",
      primary: contact.type === "tenant",
      createdAt: now,
    });
  }

  for (const organization of organizations) {
    const role = organization.tags?.includes("vertretung") ? "representation" : organization.tags?.includes("antragsgegner") ? "opponent" : "landlord";
    links.push({
      id: createStableLinkId(caseRecord.id, role, organization.id),
      caseId: caseRecord.id,
      organizationId: organization.id,
      role,
      source: "extracted",
      createdAt: now,
    });
  }

  return links;
}

export function normalizeContactKey(contact: Pick<CRMContact, "displayName" | "email" | "address" | "postalCode" | "city">) {
  return normalizeKey([contact.email, contact.displayName, contact.address, contact.postalCode, contact.city].filter(Boolean).join("|"));
}

export function normalizeOrganizationKey(organization: Pick<CRMOrganization, "name" | "email" | "address" | "postalCode" | "city">) {
  return normalizeKey([organization.email, organization.name, organization.address, organization.postalCode, organization.city].filter(Boolean).join("|"));
}

function getRelatedCaseIds(target: { contactId?: string; organizationId?: string }) {
  const caseIds = new Set<string>();
  if (target.contactId) {
    const contact = getContact(target.contactId);
    for (const caseId of contact?.linkedCaseIds ?? []) caseIds.add(caseId);
    for (const link of listCaseLinks()) if (link.contactId === target.contactId) caseIds.add(link.caseId);
  }
  if (target.organizationId) {
    const organization = getOrganization(target.organizationId);
    for (const caseId of organization?.linkedCaseIds ?? []) caseIds.add(caseId);
    for (const link of listCaseLinks()) if (link.organizationId === target.organizationId) caseIds.add(link.caseId);
  }
  return caseIds;
}

function recordHasExplicitCrmReference(record: SavedCaseRecord, target: { contactId?: string; organizationId?: string }) {
  return (
    (record.caseTasks ?? []).some((task) => crmTaskMatches(task, target)) ||
    (record.communicationThreads ?? []).some((thread) => crmCommunicationMatches(thread, undefined, target) || (thread.messages ?? []).some((message) => crmCommunicationMatches(thread, message, target)))
  );
}

function findCommunicationRows(record: SavedCaseRecord, predicate: (thread: CommunicationThread, message?: CommunicationMessage) => boolean) {
  return (record.communicationThreads ?? []).flatMap((thread) => {
    const rows = (thread.messages ?? []).filter((message) => predicate(thread, message)).map((message) => ({ record, thread, message }));
    if (rows.length === 0 && predicate(thread)) return [{ record, thread, message: undefined as CommunicationMessage | undefined }];
    return rows;
  });
}

function communicationMatchesContact(thread: CommunicationThread, message: CommunicationMessage | undefined, contactId: string) {
  return crmCommunicationMatches(thread, message, { contactId });
}

function communicationMatchesOrganization(thread: CommunicationThread, message: CommunicationMessage | undefined, organizationId: string) {
  return crmCommunicationMatches(thread, message, { organizationId });
}

function crmCommunicationMatches(thread: CommunicationThread, message: CommunicationMessage | undefined, target: { contactId?: string; organizationId?: string }) {
  if (target.contactId) {
    if (thread.relatedContactIds?.includes(target.contactId) || message?.relatedContactIds?.includes(target.contactId)) return true;
    const participants = [...(thread.participants ?? []), ...(message ? [message.from, ...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])] : [])];
    if (participants.some((participant) => participant.contactId === target.contactId)) return true;
  }
  if (target.organizationId) {
    if (thread.relatedOrganizationIds?.includes(target.organizationId) || message?.relatedOrganizationIds?.includes(target.organizationId)) return true;
    const participants = [...(thread.participants ?? []), ...(message ? [message.from, ...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])] : [])];
    if (participants.some((participant) => participant.organizationId === target.organizationId)) return true;
  }
  return false;
}

function crmTaskMatches(task: CaseTask, target: { contactId?: string; organizationId?: string }) {
  return Boolean((target.contactId && task.contactId === target.contactId) || (target.organizationId && task.organizationId === target.organizationId));
}

function crmCalendarMatches(event: CalendarEvent, target: { contactId?: string; organizationId?: string }) {
  return Boolean((target.contactId && event.contactId === target.contactId) || (target.organizationId && event.organizationId === target.organizationId));
}

function communicationActivityItems(caseId: string, thread: CommunicationThread, message: CommunicationMessage): CRMActivityFeedItem[] {
  return [
    {
      id: `crm_activity_message_${message.id}`,
      type: message.status === "failed" ? "communication_failed" : message.status === "sent" ? "communication_sent" : "communication_created",
      title: message.status === "failed" ? "Kommunikation fehlgeschlagen" : message.status === "sent" ? "Nachricht versendet" : "Nachricht erstellt",
      timestamp: message.sentAt ?? message.createdAt,
      relatedCaseId: caseId,
      relatedEntityId: message.id,
      metadata: { threadId: thread.id, messageId: message.id, status: message.status, subject: message.subject ?? thread.subject },
    },
  ];
}

function letterActivityItems(caseId: string, letter: GeneratedLetterVersion, target: { contactId?: string; organizationId?: string }): CRMActivityFeedItem[] {
  const items: CRMActivityFeedItem[] = [
    {
      id: `crm_activity_letter_generated_${letter.id}`,
      type: letter.review?.status === "review_required" || (letter.warnings?.length ?? 0) > 0 ? "review_warning" : "letter_generated",
      title: letter.review?.status === "review_required" ? "Schreiben benötigt Prüfung" : `Schreiben Version ${letter.version} generiert`,
      timestamp: letter.createdAt,
      relatedCaseId: caseId,
      relatedEntityId: letter.id,
      metadata: { status: letter.status, reviewStatus: letter.review?.status, target },
    },
  ];
  if (letter.sent?.sentAt) {
    items.push({
      id: `crm_activity_letter_sent_${letter.id}`,
      type: "letter_sent",
      title: `Schreiben Version ${letter.version} versendet`,
      timestamp: letter.sent.sentAt,
      relatedCaseId: caseId,
      relatedEntityId: letter.id,
      metadata: { method: letter.sent.method, target },
    });
  }
  return items;
}

function taskActivityItem(caseId: string, task: CaseTask): CRMActivityFeedItem {
  const isDone = task.status === "done";
  return {
    id: `crm_activity_task_${task.id}_${task.status}`,
    type: isDone ? "task_completed" : "task_created",
    title: isDone ? `Aufgabe erledigt: ${task.title}` : `Aufgabe: ${task.title}`,
    timestamp: task.completedAt ?? task.updatedAt ?? task.createdAt,
    relatedCaseId: caseId,
    relatedEntityId: task.id,
    metadata: { taskType: task.type, status: task.status, priority: task.priority, contactId: task.contactId, organizationId: task.organizationId },
  };
}

function calendarActivityItem(event: CalendarEvent): CRMActivityFeedItem {
  const completed = event.appointmentStatus === "completed" || event.status === "done";
  return {
    id: `crm_activity_calendar_${event.taskId}_${event.appointmentStatus ?? event.status}`,
    type: completed ? "calendar_completed" : "calendar_created",
    title: completed ? `Termin abgehalten: ${event.title}` : `Termin: ${event.title}`,
    timestamp: completed ? event.sourceTask.completedAt ?? event.startAt : event.startAt,
    relatedCaseId: event.caseId,
    relatedEntityId: event.taskId,
    metadata: { type: event.type, status: event.status, appointmentStatus: event.appointmentStatus, contactId: event.contactId, organizationId: event.organizationId },
  };
}

function pushContact(
  contacts: CRMContact[],
  input: {
    type: CRMContactType;
    displayName?: string;
    email?: string;
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    linkedCaseIds: string[];
    tags: string[];
    now: string;
  },
) {
  if (!input.displayName && !input.email && !input.phone) return;
  const nameParts = splitPersonName(input.displayName);
  contacts.push(normalizeContact({
    id: createStableContactId(input.type, input.displayName || input.email || input.phone || "kontakt"),
    type: input.type,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    displayName: input.displayName || input.email || input.phone || "Kontakt",
    email: input.email,
    phone: input.phone,
    address: input.address,
    postalCode: input.postalCode,
    city: input.city,
    country: "AT",
    linkedCaseIds: input.linkedCaseIds,
    tags: input.tags,
    createdAt: input.now,
    updatedAt: input.now,
  }));
}

function pushOrganization(
  organizations: CRMOrganization[],
  input: {
    type: CRMOrganizationType;
    name?: string;
    email?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    linkedCaseIds: string[];
    tags: string[];
    now: string;
  },
) {
  if (!input.name && !input.email) return;
  organizations.push(normalizeOrganization({
    id: createStableOrganizationId(input.type, input.name || input.email || "organisation"),
    type: input.type,
    name: input.name || input.email || "Organisation",
    email: input.email,
    address: input.address,
    postalCode: input.postalCode,
    city: input.city,
    country: "AT",
    linkedCaseIds: input.linkedCaseIds,
    tags: input.tags,
    createdAt: input.now,
    updatedAt: input.now,
  }));
}

function normalizeContact(contact: CRMContact): CRMContact {
  const now = new Date().toISOString();
  return {
    ...contact,
    id: contact.id || createCrmId("contact"),
    type: contact.type || "other",
    displayName: clean(contact.displayName) || "Kontakt",
    email: cleanLower(contact.email),
    phone: clean(contact.phone),
    mobile: clean(contact.mobile),
    address: clean(contact.address),
    postalCode: clean(contact.postalCode),
    city: clean(contact.city),
    country: clean(contact.country),
    tags: unique(contact.tags ?? []),
    linkedCaseIds: unique(contact.linkedCaseIds ?? []),
    createdAt: contact.createdAt || now,
    updatedAt: contact.updatedAt || contact.createdAt || now,
  };
}

function normalizeOrganization(organization: CRMOrganization): CRMOrganization {
  const now = new Date().toISOString();
  return {
    ...organization,
    id: organization.id || createCrmId("org"),
    type: organization.type || "other",
    name: clean(organization.name) || "Organisation",
    email: cleanLower(organization.email),
    phone: clean(organization.phone),
    address: clean(organization.address),
    postalCode: clean(organization.postalCode),
    city: clean(organization.city),
    country: clean(organization.country),
    tags: unique(organization.tags ?? []),
    linkedCaseIds: unique(organization.linkedCaseIds ?? []),
    createdAt: organization.createdAt || now,
    updatedAt: organization.updatedAt || organization.createdAt || now,
  };
}

function normalizeCaseLink(link: CRMCaseLink): CRMCaseLink {
  return {
    ...link,
    id: link.id || createCrmId("link"),
    role: link.role || "recipient",
    source: link.source || "manual",
    createdAt: link.createdAt || new Date().toISOString(),
  };
}

function syncLinkedCaseIdsForLink(link: CRMCaseLink) {
  if (link.contactId) {
    writeStorage(contactsKey, listContacts().map((contact) => (contact.id === link.contactId ? { ...contact, linkedCaseIds: unique([...(contact.linkedCaseIds ?? []), link.caseId]) } : contact)));
  }
  if (link.organizationId) {
    writeStorage(organizationsKey, listOrganizations().map((organization) => (organization.id === link.organizationId ? { ...organization, linkedCaseIds: unique([...(organization.linkedCaseIds ?? []), link.caseId]) } : organization)));
  }
}

function isCalendarTaskType(type: CaseTask["type"]) {
  return type === "appointment" || type === "hearing" || type === "visit";
}

function mergeContact(existing: CRMContact, incoming: CRMContact, updatedAt: string): CRMContact {
  return normalizeContact({
    ...existing,
    ...pickFilled(existing, incoming),
    tags: unique([...(existing.tags ?? []), ...(incoming.tags ?? [])]),
    linkedCaseIds: unique([...(existing.linkedCaseIds ?? []), ...(incoming.linkedCaseIds ?? [])]),
    updatedAt,
  });
}

function mergeContactPreferIncoming(existing: CRMContact, incoming: CRMContact, updatedAt: string): CRMContact {
  return normalizeContact({
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    tags: unique([...(existing.tags ?? []), ...(incoming.tags ?? [])]),
    linkedCaseIds: unique([...(existing.linkedCaseIds ?? []), ...(incoming.linkedCaseIds ?? [])]),
    updatedAt,
  });
}

function mergeOrganization(existing: CRMOrganization, incoming: CRMOrganization, updatedAt: string): CRMOrganization {
  return normalizeOrganization({
    ...existing,
    ...pickFilled(existing, incoming),
    tags: unique([...(existing.tags ?? []), ...(incoming.tags ?? [])]),
    linkedCaseIds: unique([...(existing.linkedCaseIds ?? []), ...(incoming.linkedCaseIds ?? [])]),
    updatedAt,
  });
}

function mergeOrganizationPreferIncoming(existing: CRMOrganization, incoming: CRMOrganization, updatedAt: string): CRMOrganization {
  return normalizeOrganization({
    ...existing,
    ...incoming,
    id: existing.id,
    createdAt: existing.createdAt,
    tags: unique([...(existing.tags ?? []), ...(incoming.tags ?? [])]),
    linkedCaseIds: unique([...(existing.linkedCaseIds ?? []), ...(incoming.linkedCaseIds ?? [])]),
    updatedAt,
  });
}

function pickFilled<T extends Record<string, unknown>>(existing: T, incoming: T) {
  return Object.fromEntries(Object.entries(incoming).filter(([key, value]) => key !== "id" && key !== "createdAt" && key !== "updatedAt" && isMeaningful(value) && !isMeaningful(existing[key])));
}

function dedupeContacts(contacts: CRMContact[]) {
  return dedupeByKey(contacts, normalizeContactKey, mergeContact);
}

function dedupeOrganizations(organizations: CRMOrganization[]) {
  return dedupeByKey(organizations, normalizeOrganizationKey, mergeOrganization);
}

function dedupeByKey<T extends { updatedAt: string }>(items: T[], keyFn: (item: T) => string, mergeFn: (existing: T, incoming: T, updatedAt: string) => T) {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeFn(existing, item, item.updatedAt) : item);
  }
  return [...byKey.values()];
}

function caseLinkKey(link: CRMCaseLink) {
  return [link.caseId, link.role, link.contactId ?? "", link.organizationId ?? ""].join("|");
}

function contactRole(type: CRMContactType, tags?: string[]): CRMCaseLinkRole {
  if (type === "tenant") return "tenant";
  if (type === "landlord") return "landlord";
  if (type === "opponent") return "opponent";
  if (type === "representation") return "representation";
  if (type === "internal") return "internal_owner";
  if (tags?.includes("empfaenger")) return "recipient";
  return "recipient";
}

function mapParticipantType(type?: string): CRMContactType {
  if (type === "tenant" || type === "landlord" || type === "representation" || type === "internal") return type;
  return "other";
}

function inferRepresentationOrganizationType(name?: string): CRMOrganizationType {
  if (!name) return "other";
  if (/kanzlei|anwalt|rechtsanw/i.test(name)) return "law_firm";
  if (/verwaltung|hausverwaltung|immobilien/i.test(name)) return "property_management";
  return "other";
}

function splitPersonName(name?: string) {
  const value = clean(name);
  if (!value || /\b(gmbh|kg|ag|og|verein|verwaltung|immobilien|kanzlei)\b/i.test(value)) return {};
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: value };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function readStorage<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeStorage<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("mietpilot-crm-changed"));
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stringValue(value: unknown) {
  const text = clean(String(value ?? ""));
  return text || undefined;
}

function firstEmail(...values: unknown[]) {
  for (const value of values) {
    const match = String(value ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match?.[0]) return match[0].toLowerCase();
  }
  return undefined;
}

function clean(value?: string) {
  return String(value ?? "").trim() || undefined;
}

function cleanLower(value?: string) {
  return clean(value)?.toLowerCase();
}

function isMeaningful(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function createCrmId(prefix: "contact" | "org" | "link") {
  return `crm_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createStableContactId(type: CRMContactType, value: string) {
  return `crm_contact_${type}_${slug(value)}`;
}

function createStableOrganizationId(type: CRMOrganizationType, value: string) {
  return `crm_org_${type}_${slug(value)}`;
}

function createStableLinkId(caseId: string, role: CRMCaseLinkRole, targetId: string) {
  return `crm_link_${slug(caseId)}_${role}_${slug(targetId)}`;
}

function slug(value: string) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || Math.random().toString(36).slice(2, 8);
}

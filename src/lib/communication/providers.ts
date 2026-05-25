import type { CommunicationAttachment, CommunicationMessage, CommunicationParticipant } from "@/types/case";

export type CommunicationProviderType = "manual" | "smtp" | "gmail" | "outlook";

export type CommunicationSendRequest = {
  provider: CommunicationProviderType;
  message: CommunicationMessage;
  from?: CommunicationParticipant;
  to: CommunicationParticipant[];
  cc?: CommunicationParticipant[];
  bcc?: CommunicationParticipant[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: CommunicationAttachment[];
  metadata?: Record<string, unknown>;
};

export type CommunicationSendResult = {
  success: boolean;
  provider: CommunicationProviderType;
  providerMessageId?: string;
  providerThreadId?: string;
  sentAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type CommunicationProvider = {
  type: CommunicationProviderType;
  label: string;
  configured: boolean;
  send: (request: CommunicationSendRequest) => Promise<CommunicationSendResult>;
};

export function createManualProvider(): CommunicationProvider {
  return {
    type: "manual",
    label: "Manuelles Versandprotokoll",
    configured: true,
    async send(request) {
      return {
        success: false,
        provider: "manual",
        error: "Manueller Provider sendet keine Nachrichten. Bitte Versand lokal protokollieren.",
        metadata: { messageId: request.message.id },
      };
    },
  };
}

export function getCommunicationProvider(type: CommunicationProviderType): CommunicationProvider {
  if (type === "manual") return createManualProvider();

  return {
    type,
    label: providerLabel(type),
    configured: false,
    async send() {
      return {
        success: false,
        provider: type,
        error: "Provider noch nicht konfiguriert.",
      };
    },
  };
}

function providerLabel(type: CommunicationProviderType) {
  if (type === "smtp") return "SMTP";
  if (type === "gmail") return "Gmail";
  if (type === "outlook") return "Outlook";
  return "Manuell";
}

// TODO: SMTP-Provider mit serverseitigen ENV-Werten, TLS und Fehlerklassifizierung implementieren.
// TODO: Gmail-Provider über OAuth, Provider-Thread-IDs und Attachment-Upload vorbereiten.
// TODO: Outlook-Provider über Microsoft Graph, Tenant-Konfiguration und Token-Refresh ergänzen.

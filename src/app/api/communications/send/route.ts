import { getCommunicationProvider, type CommunicationProviderType, type CommunicationSendRequest } from "@/lib/communication/providers";

export const runtime = "nodejs";

type SendBody = Partial<CommunicationSendRequest> & {
  provider?: CommunicationProviderType;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendBody;
    const providerType = body.provider ?? "manual";
    const provider = getCommunicationProvider(providerType);

    return Response.json(
      {
        success: false,
        provider: provider.type,
        configured: provider.configured,
        error: "Provider noch nicht konfiguriert. Echter Versand ist in diesem MVP deaktiviert.",
      },
      { status: 501 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Kommunikationsversand konnte nicht vorbereitet werden.",
      },
      { status: 400 },
    );
  }
}

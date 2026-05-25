const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const convertApiEndpoint = "https://v2.convertapi.com/convert/docx/to/pdf";

type ConvertApiFile = {
  FileName?: string;
  FileData?: string;
  FileUrl?: string;
};

type ConvertApiResponse = {
  Files?: ConvertApiFile[];
};

export type ConvertApiPdfResult =
  | { pdfBuffer: Buffer; error?: never }
  | { pdfBuffer?: never; error: string };

export async function convertViaConvertApi(docxBuffer: Buffer, fileName = "generated.docx"): Promise<ConvertApiPdfResult> {
  const secret = process.env.CONVERTAPI_SECRET;

  if (!secret) {
    return { error: "PDF-Service ist noch nicht konfiguriert." };
  }

  const formData = new FormData();
  formData.append("File", new Blob([new Uint8Array(docxBuffer)], { type: docxMime }), fileName);
  formData.append("StoreFile", "false");

  try {
    const response = await fetch(`${convertApiEndpoint}?Secret=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: {
        Accept: "application/json, application/pdf, application/octet-stream",
      },
      body: formData,
    });

    if (!response.ok) {
      return { error: `PDF-Konvertierung fehlgeschlagen. ConvertAPI antwortete mit HTTP ${response.status}.` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf") || contentType.includes("application/octet-stream")) {
      return { pdfBuffer: Buffer.from(await response.arrayBuffer()) };
    }

    const result = (await response.json()) as ConvertApiResponse;
    const convertedFile = result.Files?.[0];

    if (convertedFile?.FileData) {
      return { pdfBuffer: Buffer.from(convertedFile.FileData, "base64") };
    }

    if (convertedFile?.FileUrl) {
      return downloadConvertedFile(convertedFile.FileUrl);
    }

    return { error: "PDF-Konvertierung fehlgeschlagen. ConvertAPI hat kein PDF zurückgegeben." };
  } catch {
    return { error: "PDF-Konvertierung fehlgeschlagen. ConvertAPI ist nicht erreichbar." };
  }
}

async function downloadConvertedFile(fileUrl: string): Promise<ConvertApiPdfResult> {
  const response = await fetch(fileUrl);

  if (!response.ok) {
    return { error: `PDF-Download fehlgeschlagen. ConvertAPI antwortete mit HTTP ${response.status}.` };
  }

  return { pdfBuffer: Buffer.from(await response.arrayBuffer()) };
}

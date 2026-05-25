import { EditCasePageClient } from "@/components/cases/edit-case-page-client";

export default async function EditCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditCasePageClient id={id} />;
}

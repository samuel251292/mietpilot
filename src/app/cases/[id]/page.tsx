import { SavedCaseDetail } from "@/components/cases/saved-case-detail";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedCaseDetail id={id} />;
}

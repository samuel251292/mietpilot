"use client";

import { useParams } from "next/navigation";
import { CRMDetailPage } from "@/components/clients/crm-detail-page";

export default function OrganizationDetailRoute() {
  const params = useParams<{ id: string }>();
  return <CRMDetailPage mode="organization" id={params.id} />;
}

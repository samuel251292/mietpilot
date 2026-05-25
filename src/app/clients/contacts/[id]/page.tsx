"use client";

import { useParams } from "next/navigation";
import { CRMDetailPage } from "@/components/clients/crm-detail-page";

export default function ContactDetailRoute() {
  const params = useParams<{ id: string }>();
  return <CRMDetailPage mode="contact" id={params.id} />;
}

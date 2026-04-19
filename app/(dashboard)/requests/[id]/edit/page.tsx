import { notFound, redirect } from "next/navigation";
import { getSession, canAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { RequestForm } from "@/components/requests/RequestForm";
import type { Role } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditRequestPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const request = await db.request.findUnique({ where: { id } });
  if (!request) notFound();

  const isOwner = request.requesterId === session.user.id;
  const isAdmin = canAdmin(session.user.role as Role);

  if (!isOwner && !isAdmin) notFound();

  // Only editable in DRAFT or REVISION_REQUESTED
  if (!["DRAFT", "REVISION_REQUESTED"].includes(request.status) && !isAdmin) {
    redirect(`/requests/${id}`);
  }

  // Map DB record to form defaults
  const defaultValues = {
    title: request.title,
    campaignName: request.campaignName ?? "",
    campaignObjective: request.campaignObjective ?? "",
    targetAudience: request.targetAudience ?? "",
    offerMessage: request.offerMessage ?? "",
    headline: request.headline ?? "",
    subheadline: request.subheadline ?? "",
    copyVariants: request.copyVariants ?? "",
    ctaText: request.ctaText ?? "",
    ctaUrl: request.ctaUrl ?? "",
    platforms: request.platforms as string[],
    sizes: request.sizes as string[],
    priority: (request.priority ?? "NORMAL") as "NORMAL" | "HIGH" | "URGENT",
    priorityReason: request.priorityReason ?? "",
    brandColors: request.brandColors as string[],
    templateId: request.templateId ?? "",
    deadline: request.deadline ? request.deadline.toISOString().split("T")[0] : "",
    notes: request.notes ?? "",
  };

  return (
    <div>
      <Header
        title="Edit Request"
        description={request.campaignName ?? request.title}
      />
      <RequestForm requestId={id} defaultValues={defaultValues} />
    </div>
  );
}

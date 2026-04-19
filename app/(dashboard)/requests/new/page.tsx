import { Header } from "@/components/layout/header";
import { RequestForm } from "@/components/requests/RequestForm";

export default function NewRequestPage() {
  return (
    <div>
      <Header
        title="New Banner Request"
        description="Fill in the brief below to generate AI banner variants."
      />
      <RequestForm />
    </div>
  );
}

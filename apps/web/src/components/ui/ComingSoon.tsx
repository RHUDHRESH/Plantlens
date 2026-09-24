import { Construction } from "lucide-react";
import { EmptyState, PageHeader } from "./primitives";

/** Temporary placeholder while a v2 view is rebuilt. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="pl-page">
      <PageHeader title={title} description={description} />
      <EmptyState icon={<Construction />} title="This view is being rebuilt" />
    </div>
  );
}

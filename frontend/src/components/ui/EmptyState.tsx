import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  scaffold?: boolean;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  scaffold = false,
}: EmptyStateProps) {
  return (
    <div className="pl-empty-state" role="status">
      {icon && <div className="pl-empty-state__icon">{icon}</div>}
      <h4 className="pl-empty-state__title">{title}</h4>
      {description && <p className="pl-empty-state__desc">{description}</p>}
      {scaffold && <span className="pl-scaffold-tag">Scaffold / Demo</span>}
      {action && <div className="pl-empty-state__action">{action}</div>}
    </div>
  );
}
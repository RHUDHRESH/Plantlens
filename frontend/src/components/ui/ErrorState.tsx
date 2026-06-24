import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  scaffold?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  scaffold = false,
}: ErrorStateProps) {
  return (
    <div className="pl-error-state" role="alert">
      <h4 className="pl-error-state__title">{title}</h4>
      <p className="pl-error-state__message">{message}</p>
      {scaffold && <span className="pl-scaffold-tag">Scaffold / Demo</span>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
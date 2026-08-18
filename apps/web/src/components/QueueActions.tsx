export function QueueActions({
  canCallNext,
  canStart,
  canComplete,
  canSkip,
  busy,
  onCallNext,
  onStart,
  onComplete,
  onSkip,
}: {
  canCallNext: boolean;
  canStart: boolean;
  canComplete: boolean;
  canSkip: boolean;
  busy: boolean;
  onCallNext: () => void;
  onStart: () => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fp-desk-actions">
      <button
        type="button"
        className="fp-btn fp-desk-button"
        data-variant="success"
        onClick={onCallNext}
        disabled={busy || !canCallNext}
      >
        Call Next
      </button>
      <button
        type="button"
        className="fp-btn fp-desk-button"
        data-variant="success"
        onClick={onStart}
        disabled={busy || !canStart}
      >
        Start Service
      </button>
      <button
        type="button"
        className="fp-btn fp-desk-button"
        data-variant="success"
        onClick={onComplete}
        disabled={busy || !canComplete}
      >
        Complete Service
      </button>
      <button
        type="button"
        className="fp-btn fp-desk-button"
        data-variant="danger"
        onClick={onSkip}
        disabled={busy || !canSkip}
      >
        Skip
      </button>
    </div>
  );
}

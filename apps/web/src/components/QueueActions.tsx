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
        className="fp-desk-button"
        onClick={onCallNext}
        disabled={busy || !canCallNext}
      >
        Call Next
      </button>
      <button
        type="button"
        className="fp-desk-button"
        onClick={onStart}
        disabled={busy || !canStart}
      >
        Start Service
      </button>
      <button
        type="button"
        className="fp-desk-button"
        onClick={onComplete}
        disabled={busy || !canComplete}
      >
        Complete Service
      </button>
      <button
        type="button"
        className="fp-desk-button fp-desk-button-danger"
        onClick={onSkip}
        disabled={busy || !canSkip}
      >
        Skip
      </button>
    </div>
  );
}

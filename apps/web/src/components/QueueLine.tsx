import { PERSON_PALETTE, PersonIllustration } from "./PersonIllustration";

const MAX_VISIBLE_PEOPLE = 8;

/**
 * The queue rendered as a line of people rather than a bare number — each one
 * animates in on mount ("Queue Animation Timeline": you join, people move
 * forward). Real queue length drives the count; nothing here is decorative
 * padding.
 */
export function QueueLine({ queueLength }: { queueLength: number }) {
  const visibleCount = Math.min(queueLength, MAX_VISIBLE_PEOPLE);
  const overflow = queueLength - visibleCount;

  if (queueLength <= 0) {
    return <p className="fp-queue-line-empty">No one is waiting.</p>;
  }

  return (
    <div className="fp-queue-line" role="img" aria-label={`${queueLength} people waiting in line`}>
      {Array.from({ length: visibleCount }, (_, index) => (
        <span
          key={index}
          className="fp-queue-person"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <PersonIllustration color={PERSON_PALETTE[index % PERSON_PALETTE.length]!} />
        </span>
      ))}
      {overflow > 0 ? <span className="fp-queue-overflow">+{overflow}</span> : null}
    </div>
  );
}

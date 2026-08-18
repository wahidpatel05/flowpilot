"use client";

import { useEffect, useRef, useState } from "react";
import { PERSON_PALETTE, PersonIllustration } from "./PersonIllustration";

const MAX_VISIBLE_PEOPLE = 8;

/** How long the "everyone steps forward" shuffle plays. */
const ADVANCE_ANIMATION_MS = 460;

/**
 * The queue rendered as a line of people rather than a bare number. Real queue
 * length drives the count; nothing here is decorative padding.
 *
 * Three states carry meaning: a new arrival walks in at the back, the head of
 * the line is marked as being called, and when the queue actually shortens the
 * whole line shuffles one step forward — so the animation reports a real event
 * rather than running on a timer.
 */
export function QueueLine({ queueLength }: { queueLength: number }) {
  const visibleCount = Math.min(queueLength, MAX_VISIBLE_PEOPLE);
  const overflow = queueLength - visibleCount;

  const previousLength = useRef(queueLength);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    const shortened = queueLength < previousLength.current;
    previousLength.current = queueLength;
    if (!shortened) return;

    setAdvancing(true);
    const timer = setTimeout(() => setAdvancing(false), ADVANCE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [queueLength]);

  if (queueLength <= 0) {
    return <p className="fp-queue-line-empty">No one is waiting.</p>;
  }

  return (
    <div
      className="fp-queue-line"
      data-advancing={advancing ? "true" : undefined}
      role="img"
      aria-label={`${queueLength} people waiting in line`}
    >
      {Array.from({ length: visibleCount }, (_, index) => (
        <span
          key={index}
          className="fp-queue-person"
          data-state={index === 0 ? "called" : "waiting"}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <PersonIllustration
            color={PERSON_PALETTE[index % PERSON_PALETTE.length]!}
            style={{ animationDelay: `${index * 180}ms` }}
          />
        </span>
      ))}
      {overflow > 0 ? <span className="fp-queue-overflow">+{overflow}</span> : null}
    </div>
  );
}

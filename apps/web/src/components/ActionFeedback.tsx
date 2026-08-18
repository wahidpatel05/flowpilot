export interface Feedback {
  type: "success" | "error";
  message: string;
}

/**
 * Every Desk action gives immediate visual feedback, and a refusal shows the
 * RPC's own plain-language message rather than a generic failure — see the
 * acceptance criteria on W5.
 */
export function ActionFeedback({ feedback }: { feedback: Feedback | null }) {
  if (feedback === null) return null;

  return (
    <div
      className="fp-desk-feedback"
      data-type={feedback.type}
      role={feedback.type === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </div>
  );
}

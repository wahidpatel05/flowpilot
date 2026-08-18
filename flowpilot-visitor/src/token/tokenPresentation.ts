/**
 * The Live Token view model.
 *
 * Same discipline as facility/catalogue.ts: owns wording only. While the
 * Token is `waiting`, every number comes from `projectTokenEta` — the same
 * function the Service catalogue's Health and the golden-path script's
 * assertions use — so the phone can never disagree with itself about the
 * same Token, let alone with Control.
 *
 * Once the Token is `called` or beyond, position and ETA stop being
 * meaningful (the Visitor has reached, or left, the front of the line), so
 * this reads the Token's own status instead of the projection.
 */
import {
  projectTokenEta,
  type FacilityProjection,
  type QueueHealth,
  type TokenStatus,
} from "@flowpilot/core";
import { healthLabelFor, waitLabelFor } from "../facility/healthPresentation";

export interface LiveTokenModel {
  tokenId: string;
  tokenNumber: string;
  serviceName: string;
  status: TokenStatus;
  /** TRUE once the Token has left the queue for good: no further updates come. */
  isTerminal: boolean;
  /** The one thing a Visitor should read in under two seconds. */
  headline: string;
  subheadline: string;
  /** Canonical Health from the engine. Null when the Token isn't queueing. */
  health: QueueHealth | null;
  healthLabel: string | null;
  customersAhead: number | null;
  etaMinutes: number | null;
}

interface BuildLiveTokenModelInput {
  token: {
    id: string;
    /** Nullable in the row shape (flowpilot-core); "" is never rendered as a name. */
    token_number?: string | null;
    status: TokenStatus;
    service_id: string;
  };
  serviceName: string;
  /** The Service's projection, scoped to one Service. Null when not needed. */
  projection: FacilityProjection | null;
}

function waitingModel(
  input: BuildLiveTokenModelInput,
): Pick<
  LiveTokenModel,
  "headline" | "subheadline" | "health" | "healthLabel" | "customersAhead" | "etaMinutes"
> {
  // projectTokenEta finds nothing only if the row it was given disagrees with
  // the Token's own status — a fetch race, not a state this function should
  // paper over silently.
  const eta =
    input.projection === null ? null : projectTokenEta(input.projection, input.token.id);
  if (eta === null) {
    return {
      headline: "Finding your place in line…",
      subheadline: "",
      health: null,
      healthLabel: null,
      customersAhead: null,
      etaMinutes: null,
    };
  }

  const isOpen = Number.isFinite(eta.predictedWaitMinutes);
  const etaMinutes = isOpen ? Math.round(eta.predictedWaitMinutes) : null;

  return {
    headline: waitLabelFor(etaMinutes),
    subheadline: eta.customersAhead <= 0 ? "You're next!" : `${eta.customersAhead} people ahead`,
    health: eta.health,
    healthLabel: healthLabelFor(eta.health, isOpen),
    customersAhead: eta.customersAhead,
    etaMinutes,
  };
}

const STATIC_STATUS: Partial<
  Record<TokenStatus, { headline: string; subheadline: string; isTerminal: boolean }>
> = {
  called: {
    headline: "You're being called",
    subheadline: "Please go to the counter now.",
    isTerminal: false,
  },
  serving: {
    headline: "You're being served",
    subheadline: "This won't take long.",
    isTerminal: false,
  },
  completed: {
    headline: "All done",
    subheadline: "Thanks for visiting.",
    isTerminal: true,
  },
  cancelled: {
    headline: "Cancelled",
    subheadline: "You left this queue.",
    isTerminal: true,
  },
  skipped: {
    headline: "Missed your call",
    subheadline: "Rejoin the queue if you still need this Service.",
    isTerminal: true,
  },
};

/** The fields STATIC_STATUS entries don't have an opinion on. */
const NO_QUEUE_STANDING = {
  health: null,
  healthLabel: null,
  customersAhead: null,
  etaMinutes: null,
} as const;

export function buildLiveTokenModel(input: BuildLiveTokenModelInput): LiveTokenModel {
  const { token, serviceName } = input;
  const staticStatus = STATIC_STATUS[token.status];

  const presentation = staticStatus
    ? { ...staticStatus, ...NO_QUEUE_STANDING }
    : { ...waitingModel(input), isTerminal: false };

  return {
    tokenId: token.id,
    tokenNumber: token.token_number ?? "",
    serviceName,
    status: token.status,
    ...presentation,
  };
}

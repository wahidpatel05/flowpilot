/**
 * The one seam between this app and the shared engine. No file outside this
 * one may import flowpilot-core directly, and no component may compute an
 * ETA, a Health band, or an active-Counter count itself — see
 * docs/adr/0001-assignment-is-the-movable-unit.md and CONTEXT.md.
 */
export * from "../../../../flowpilot-core/src/index.js";

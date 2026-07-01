/**
 * Common artifact envelope embedded in every JSON artifact.
 *
 * { artifact, schemaVersion, artifactId, runId, appUrl, generatedAt, roles, sourceArtifacts }
 */

import { SCHEMA_VERSION } from "./constants.js";

export interface Envelope {
  artifact: string;
  schemaVersion: string;
  artifactId: string;
  runId: string;
  appUrl: string;
  generatedAt: string;
  roles: string[];
  sourceArtifacts: string[];
}

export interface EnvelopeInput {
  artifact: string;
  artifactId: string;
  runId: string;
  appUrl: string;
  /** Stored lowercase/slug; Title-Cased only at render time. */
  roles: string[];
  sourceArtifacts?: string[];
  /**
   * generatedAt is passed in (never generated with Date.now inside a transform)
   * so pure-transform phases stay deterministic modulo this field.
   */
  generatedAt: string;
}

export function makeEnvelope(input: EnvelopeInput): Envelope {
  return {
    artifact: input.artifact,
    schemaVersion: SCHEMA_VERSION,
    artifactId: input.artifactId,
    runId: input.runId,
    appUrl: input.appUrl,
    generatedAt: input.generatedAt,
    roles: [...input.roles],
    sourceArtifacts: input.sourceArtifacts ? [...input.sourceArtifacts] : [],
  };
}

/** Validate that an object carries a well-formed envelope. Returns list of problems. */
export function validateEnvelope(obj: any): string[] {
  const problems: string[] = [];
  const required = [
    "artifact",
    "schemaVersion",
    "artifactId",
    "runId",
    "appUrl",
    "generatedAt",
    "roles",
    "sourceArtifacts",
  ];
  for (const key of required) {
    if (obj[key] === undefined || obj[key] === null) problems.push(`missing envelope field: ${key}`);
  }
  if (obj.schemaVersion && obj.schemaVersion !== SCHEMA_VERSION) {
    problems.push(`schemaVersion ${obj.schemaVersion} !== ${SCHEMA_VERSION}`);
  }
  if (obj.roles && !Array.isArray(obj.roles)) problems.push("roles must be an array");
  if (obj.sourceArtifacts && !Array.isArray(obj.sourceArtifacts))
    problems.push("sourceArtifacts must be an array");
  return problems;
}

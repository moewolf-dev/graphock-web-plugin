import yaml from 'js-yaml'
import { canonicalize, type ClipDocument } from '@graphock/clip-model'

/** Deterministic JSON: stable key order, LF, trailing newline. */
export function toJson(document: ClipDocument): string {
  return `${JSON.stringify(JSON.parse(canonicalize(document)), null, 2)}\n`
}

/**
 * YAML is a serialization of the *same* document model. Do not add fields
 * here that do not exist in the model.
 */
export function toYaml(document: ClipDocument): string {
  const plain = JSON.parse(canonicalize(document)) as ClipDocument
  return yaml.dump(plain, {
    lineWidth: -1,
    noRefs: true,
    noCompatMode: true,
    sortKeys: true
  })
}

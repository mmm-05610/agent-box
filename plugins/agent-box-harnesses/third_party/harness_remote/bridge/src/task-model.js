/**
 * A task's model selection, in the shape the client already speaks and the agents already accept.
 */
export function normalizeTaskModel(value) {
  if (!value || typeof value !== "object") return null
  const providerID = typeof value.providerID === "string" ? value.providerID.trim() : ""
  const modelID = typeof value.modelID === "string" ? value.modelID.trim() : ""
  if (!providerID || !modelID) return null
  const variant = typeof value.variant === "string" ? value.variant.trim() : ""
  return variant ? { providerID, modelID, variant } : { providerID, modelID }
}

export function promptModelBody(model) {
  if (!model) return undefined
  return { providerID: model.providerID, modelID: model.modelID }
}

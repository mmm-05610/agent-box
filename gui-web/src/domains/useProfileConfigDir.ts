/**
 * Domain shim — the config-dir resolver now lives in hooks/ so both hooks
 * and domain lists share one implementation (layered data flow).
 */
export { useProfileConfigDir } from '@/hooks/useProfileConfigDir'

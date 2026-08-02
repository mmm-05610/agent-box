/**
 * Domain shim — the profile-path resolver lives in hooks/ so both hooks and
 * domain lists share one implementation (layered data flow).
 */
export { useProfilePath } from '@/hooks/useProfilePath'

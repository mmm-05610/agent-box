import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import {
  ensureAgentBoxProfileCatalog,
  selectComposerProfile,
  setComposerTemporaryOverrides
} from '@/application/profile/wire-composer-profile'
import { useI18n } from '@/i18n'
import type { ComposerProfileState } from '@/lib/composer/types'
import { $agentBoxProfiles, $agentBoxService, $agentBoxSessions, $draftConfigStates } from '@/store/agentbox-service'
import { $draftExecutionContexts, composerDraftScopeKey } from '@/store/composer'
import { $workspaceProfilePreferences } from '@/store/workspace-profile-preference'

export function useComposerProfile({
  draftScope,
  sessionId,
  workspaceId
}: {
  draftScope: null | string
  sessionId: null | string
  workspaceId: null | string
}): ComposerProfileState {
  const { t } = useI18n()
  const service = useStore($agentBoxService)
  const profiles = useStore($agentBoxProfiles)
  const sessions = useStore($agentBoxSessions)
  const contexts = useStore($draftExecutionContexts)
  const configStates = useStore($draftConfigStates)
  const workspaceProfilePreferences = useStore($workspaceProfilePreferences)
  const [switching, setSwitching] = useState(false)
  const scope = composerDraftScopeKey(draftScope)
  const currentSession = sessionId ? sessions[sessionId] ?? null : null
  const draftContext = contexts[scope] ?? { overrides: [], profileId: null }
  const rememberedProfileId = workspaceId ? workspaceProfilePreferences[workspaceId] ?? null : null
  const rememberedProfileExists = profiles.some(profile => profile.id === rememberedProfileId)

  const selectedId =
    currentSession?.profileId ?? draftContext.profileId ?? (rememberedProfileExists ? rememberedProfileId : null)

  const currentProfile = profiles.find(profile => profile.id === currentSession?.profileId) ?? null
  const sessionUnavailable = Boolean(sessionId && !currentSession)

  useEffect(() => {
    if (service.phase === 'idle') {
      void ensureAgentBoxProfileCatalog(agentBoxRuntimeClient()).catch(() => undefined)
    }
  }, [service.phase])

  useEffect(() => {
    if (
      currentSession ||
      sessionId ||
      draftContext.profileId ||
      !rememberedProfileExists ||
      !rememberedProfileId ||
      service.phase !== 'ready'
    ) {
      return
    }

    void selectComposerProfile(agentBoxRuntimeClient(), {
      currentSession: null,
      profileId: rememberedProfileId,
      scope,
      workspaceId
    })
  }, [
    currentSession,
    draftContext.profileId,
    rememberedProfileExists,
    rememberedProfileId,
    scope,
    service.phase,
    sessionId,
    workspaceId
  ])

  const options = useMemo(
    () =>
      profiles.map(profile => {
        const sameHarness = !currentSession || (currentProfile && profile.harness === currentProfile.harness)

        return {
          displayName: profile.displayName,
          harness: profile.harness,
          id: profile.id,
          selectable: Boolean(!sessionUnavailable && sameHarness),
          ...(!sameHarness ? { unavailableReason: t.composer.profileSwitchUnavailable } : {})
        }
      }),
    [currentProfile, currentSession, profiles, sessionUnavailable, t.composer.profileSwitchUnavailable]
  )

  const onSelect = useCallback(
    async (profileId: string) => {
      setSwitching(Boolean(currentSession))

      try {
        return await selectComposerProfile(agentBoxRuntimeClient(), {
          currentSession,
          profileId,
          scope,
          workspaceId
        })
      } finally {
        setSwitching(false)
      }
    },
    [currentSession, scope, workspaceId]
  )

  const onOverrideChange = useCallback(
    (overrides: ComposerProfileState['overrides']) => setComposerTemporaryOverrides(scope, overrides),
    [scope]
  )

  const config = selectedId ? configStates[scope] : undefined

  return {
    configDescriptor: config?.status === 'ready' ? config.descriptor : config?.status === 'unavailable' ? null : undefined,
    onOverrideChange,
    onSelect,
    options,
    overrides: draftContext.overrides,
    selectedId,
    switching,
    ...(sessionUnavailable || (profiles.length === 0 && service.phase === 'unavailable')
      ? { unavailableReason: sessionUnavailable ? t.composer.profileSwitchUnavailable : service.detail || undefined }
      : {})
  }
}

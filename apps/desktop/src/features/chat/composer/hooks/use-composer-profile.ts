import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { wireCapability } from '@/api/wire-v1-client'
import {
  ensureAgentBoxProfileCatalog,
  resolveComposerConfig,
  selectComposerProfile,
  setComposerTemporaryOverrides
} from '@/application/profile/wire-composer-profile'
import { ensureAgentBoxProviderModelCatalog } from '@/application/provider-model/wire-provider-model-catalog'
import { useI18n } from '@/i18n'
import type { ComposerConfigResolutionState, ComposerProfileState } from '@/lib/composer/types'
import {
  $agentBoxHello,
  $agentBoxProfiles,
  $agentBoxProviderModels,
  $agentBoxService,
  $agentBoxSessions,
  $draftConfigStates
} from '@/store/agentbox-service'
import { $draftExecutionContexts, composerDraftScopeKey } from '@/store/composer'
import { $workspaceProfilePreferences } from '@/store/workspace-profile-preference'
import type { ConfigOverride } from '@/types/wire/wire-v1'

/** Stable identity for "no overrides yet" so the resolution effect does not
 *  re-fire on every render while a scope has no stored runtime context. */
const NO_OVERRIDES: ConfigOverride[] = []

/** The service owns effective-configuration resolution; an undeclared method is
 *  reported as such rather than requested and guessed at. */
const CONFIG_RESOLVE = 'config.resolve'

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
  const hello = useStore($agentBoxHello)
  const profiles = useStore($agentBoxProfiles)
  const sessions = useStore($agentBoxSessions)
  const contexts = useStore($draftExecutionContexts)
  const configStates = useStore($draftConfigStates)
  const providerModels = useStore($agentBoxProviderModels)
  const workspaceProfilePreferences = useStore($workspaceProfilePreferences)
  const [switching, setSwitching] = useState(false)
  const [configResolution, setConfigResolution] = useState<ComposerConfigResolutionState>({ status: 'idle' })
  const scope = composerDraftScopeKey(draftScope)
  const currentSession = sessionId ? sessions[sessionId] ?? null : null
  const draftContext = contexts[scope] ?? { overrides: NO_OVERRIDES, profileId: null }
  const rememberedProfileId = workspaceId ? workspaceProfilePreferences[workspaceId] ?? null : null
  const rememberedProfileExists = profiles.some(profile => profile.id === rememberedProfileId)

  const selectedId =
    currentSession?.profileId ?? draftContext.profileId ?? (rememberedProfileExists ? rememberedProfileId : null)

  const currentProfile = profiles.find(profile => profile.id === currentSession?.profileId) ?? null
  const selectedProfile = profiles.find(profile => profile.id === selectedId) ?? currentProfile
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

  const selectedDescriptor =
    config?.status === 'ready' && config.descriptor && config.profileId === selectedId ? config.descriptor : null

  // A preview of what the service would run for this exact scope, re-resolved
  // whenever the profile, workspace or overrides change. Each run cancels its
  // predecessor, so an answer for an older scope cannot repaint the current one.
  useEffect(() => {
    if (!selectedId || !workspaceId || !selectedDescriptor) {
      setConfigResolution({ status: 'idle' })

      return
    }

    const capability = hello
      ? wireCapability(hello, CONFIG_RESOLVE)
      : { id: CONFIG_RESOLVE, reason: 'CAPABILITY_NOT_DECLARED', supported: false }

    // An undeclared method is reported, never requested: no transport call and
    // no claim that the configuration is valid.
    if (!capability.supported) {
      setConfigResolution({ detail: capability.reason || 'CAPABILITY_NOT_DECLARED', status: 'unavailable' })

      return
    }

    let current = true

    setConfigResolution({ status: 'resolving' })

    void resolveComposerConfig(agentBoxRuntimeClient(), {
      overrides: draftContext.overrides,
      profileId: selectedId,
      workspaceId
    }).then(
      result => {
        if (!current) {
          return
        }

        // Exactly what the service returned — the preview is never completed
        // from the descriptor, and a rejection never rewrites the overrides.
        setConfigResolution(
          result.outcome === 'resolved'
            ? { effective: result.effective, status: 'resolved' }
            : { invalidControls: result.invalidControls, status: 'rejected' }
        )
      },
      (error: unknown) => {
        if (!current) {
          return
        }

        setConfigResolution({
          detail: error instanceof Error ? error.message : String(error),
          status: 'unavailable'
        })
      }
    )

    return () => {
      current = false
    }
  }, [draftContext.overrides, hello, selectedDescriptor, selectedId, workspaceId])

  const hasModelSlot = selectedDescriptor?.controls.some(control => control.kind === 'model_slot')

  useEffect(() => {
    if (hasModelSlot) {
      void ensureAgentBoxProviderModelCatalog(agentBoxRuntimeClient())
    }
  }, [hasModelSlot])

  const modelChoices = useMemo(
    () =>
      providerModels
        .filter(model => model.harness === selectedProfile?.harness)
        .flatMap(model =>
          model.models.map(entry => ({
            availability: entry.availability,
            displayName: entry.displayName,
            modelId: entry.modelId,
            providerDisplayName: model.displayName,
            providerId: model.id,
            unavailableReason: entry.unavailableReason
          }))
        ),
    [providerModels, selectedProfile?.harness]
  )

  return {
    configDescriptor: config?.status === 'ready' ? config.descriptor : config?.status === 'unavailable' ? null : undefined,
    configResolution,
    onOverrideChange,
    onSelect,
    options,
    modelChoices,
    overrides: draftContext.overrides,
    selectedId,
    switching,
    ...(sessionUnavailable || (profiles.length === 0 && service.phase === 'unavailable')
      ? { unavailableReason: sessionUnavailable ? t.composer.profileSwitchUnavailable : service.detail || undefined }
      : {})
  }
}

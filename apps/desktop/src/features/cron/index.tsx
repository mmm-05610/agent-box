import { createCronTriggerController, type CronTriggerController } from '@hermes/shared'
import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createCronJob, deleteCronJob, getAutomationBlueprints, instantiateAutomationBlueprint, pauseCronJob, resumeCronJob, updateCronJob } from '@/api/cron'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useI18n } from '@/i18n'
import { asText } from '@/lib/text'
import { $cronFocusJobId, $cronJobs, invalidateCronJobsRequests, setCronFocusJobId } from '@/store/cron'
import { notify, notifyError } from '@/store/notifications'
import { $profileScope, ALL_PROFILES } from '@/store/profile'
import { type AutomationBlueprint, type CronJob } from '@/types/hermes'

import { useRefreshHotkey } from '@/app/hooks/use-refresh-hotkey'
import {
  Panel,
  PanelAddButton,
  PanelBody,
  PanelEmpty,
  PanelHeader,
  PanelList,
  PanelListRow,
  PanelSectionLabel
} from '@/app/shell/layers/overlays/panel'

import type {
  EditorState,
  EditorValues} from './components';
import {
  CronEditorDialog,
  CronJobDetail,
  CronJobListRow
} from './components'
import { mutateAndRefreshCronJobs, refreshCronJobs, triggerAndRefreshCronJobs } from './cron-actions'
import {
  cronEditorUpdates,
  jobIsScriptOnly
} from './cron-job-model'
import { jobState, jobTitle } from './job-state'
import type {
  CronViewProps} from './view-model';
import {
  cronProfileForScope,
  DEFAULT_DELIVER,
  jobName,
  matchesQuery,
  truncate,
} from './view-model'
export { DeliverCheckboxes } from './components'

export function CronView({ onClose, onOpenSession, setStatusbarItemGroup: _setStatusbarItemGroup }: CronViewProps) {
  const { t } = useI18n()
  const c = t.cron
  // Source of truth is the shared atom (also fed by the controller poll), so the
  // sidebar and this overlay never drift — a delete here clears the sidebar row
  // immediately. `loading` only gates the first paint before the atom is filled.
  const jobs = useStore($cronJobs)
  const [loading, setLoading] = useState(jobs.length === 0)
  const [query, setQuery] = useState('')
  const [busyJobTokens, setBusyJobTokens] = useState<ReadonlyMap<string, symbol>>(() => new Map())
  const [triggeringJobKeys, setTriggeringJobKeys] = useState<ReadonlySet<string>>(() => new Set())
  const triggerControllerRef = useRef<CronTriggerController | null>(null)

  // eslint-disable-next-line no-restricted-syntax -- controller mount identity, not an atom mirror
  useEffect(() => {
    const controller = createCronTriggerController((key, running) => {
      if (triggerControllerRef.current !== controller) {
        return
      }

      setTriggeringJobKeys(current => {
        const next = new Set(current)

        if (running) {
          next.add(key)
        } else {
          next.delete(key)
        }

        return next
      })
    })

    triggerControllerRef.current = controller

    return () => {
      triggerControllerRef.current = null
    }
  }, [])

  // Master/detail: the job whose schedule + run history fill the right pane.
  const [selectedJobId, setSelectedJobId] = useState<null | string>(null)
  // Set when a job is opened from the sidebar so we scroll it into view once the
  // row exists. Cleared after the scroll fires.
  const pendingScrollRef = useRef<null | string>(null)
  const focusJobId = useStore($cronFocusJobId)

  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [pendingDelete, setPendingDelete] = useState<CronJob | null>(null)

  // Jobs live per-profile on disk and the list endpoint aggregates 'all' by
  // default — scope the fetch to the sidebar's profile scope so this overlay
  // and the sidebar (which share the $cronJobs atom) agree on what's shown.
  const profileScope = useStore($profileScope)
  const profile = cronProfileForScope(profileScope)

  const refresh = useCallback(async () => {
    const { refreshError, stale } = await refreshCronJobs(profile)

    if (stale) {
      return
    }

    if (refreshError) {
      notifyError(refreshError, c.failedLoad)
    }

    setLoading(false)
  }, [c, profile])

  useRefreshHotkey(refresh)

  useEffect(() => {
    void refresh()
    // Fence the previous profile's request before the next profile effect, and
    // fence every pending completion when the overlay unmounts.

    return () => invalidateCronJobsRequests()
  }, [refresh])

  // Sidebar → "open this job": resolve the focus id (or name) to a job, select
  // it, queue a scroll, then clear the one-shot focus so re-opening cron
  // normally doesn't re-trigger it.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    if (!focusJobId) {
      return
    }

    const match = jobs.find(job => job.id === focusJobId || jobName(job) === focusJobId)

    if (match) {
      setSelectedJobId(match.id)
      pendingScrollRef.current = match.id
    }

    setCronFocusJobId(null)
  }, [focusJobId, jobs])

  const visibleJobs = useMemo(
    () => jobs.filter(job => matchesQuery(job, query.trim())).sort((a, b) => jobTitle(a).localeCompare(jobTitle(b))),
    [jobs, query]
  )

  // Blueprint recipes render in the same list rail, below the jobs — clicking
  // one opens the create dialog pre-seeded to that recipe. Same query key as
  // the dialog's "Start from" dropdown, so the catalog is fetched once.
  const blueprintsQuery = useQuery({
    queryKey: ['cron-blueprints'],
    queryFn: async () => (await getAutomationBlueprints()).blueprints
  })

  const visibleBlueprints = useMemo(() => {
    const list = blueprintsQuery.data ?? []
    const needle = query.trim().toLowerCase()

    return needle ? list.filter(item => `${item.title} ${item.description}`.toLowerCase().includes(needle)) : list
  }, [blueprintsQuery.data, query])

  // Detail always reflects a concrete job: the explicitly selected one, else the
  // first visible row, so the right pane is never empty while jobs exist.
  const selectedJob = useMemo(
    () => visibleJobs.find(job => job.id === selectedJobId) ?? visibleJobs[0] ?? null,
    [visibleJobs, selectedJobId]
  )

  // Scroll a sidebar-opened job into view once its list row is mounted.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    const target = pendingScrollRef.current

    if (!target || selectedJob?.id !== target) {
      return
    }

    pendingScrollRef.current = null
    requestAnimationFrame(() => {
      document.querySelector(`[data-panel-row="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'nearest' })
    })
  }, [selectedJob])

  const totalCount = jobs.length

  function beginJobBusy(jobId: string): symbol {
    const token = Symbol(jobId)

    setBusyJobTokens(current => new Map(current).set(jobId, token))

    return token
  }

  function endJobBusy(jobId: string, token: symbol): void {
    setBusyJobTokens(current => {
      if (current.get(jobId) !== token) {
        return current
      }

      const next = new Map(current)

      next.delete(jobId)

      return next
    })
  }

  async function handlePauseResume(job: CronJob) {
    const busyToken = beginJobBusy(job.id)

    try {
      const isPaused = jobState(job) === 'paused'

      const { refreshError, stale } = await mutateAndRefreshCronJobs(profile, () =>
        isPaused ? resumeCronJob(job.id) : pauseCronJob(job.id)
      )

      if (stale) {
        return
      }

      if (refreshError) {
        notifyError(refreshError, c.failedLoad)
      }

      notify({
        kind: 'success',
        title: isPaused ? c.resumed : c.paused,
        message: truncate(jobTitle(job), 60)
      })
    } catch (err) {
      notifyError(err, c.failedUpdate)
    } finally {
      endJobBusy(job.id, busyToken)
    }
  }

  async function handleTrigger(job: CronJob) {
    const viewProfile = profile
    const key = `${viewProfile}:${job.id}`
    const controller = triggerControllerRef.current

    if (!controller) {
      return
    }

    try {
      const run = await controller.run(
        key,
        () => triggerAndRefreshCronJobs(job.id, viewProfile),
        () => notify({ kind: 'info', title: c.triggerNow, message: truncate(jobTitle(job), 60) })
      )

      if (
        triggerControllerRef.current !== controller ||
        cronProfileForScope($profileScope.get()) !== viewProfile ||
        !run.started ||
        !run.value
      ) {
        return
      }

      const { refreshError, stale } = run.value

      if (stale) {
        return
      }

      if (refreshError) {
        notifyError(refreshError, c.failedLoad)
      }

      notify({ kind: 'success', title: c.triggered, message: truncate(jobTitle(job), 60) })
    } catch (err) {
      if (triggerControllerRef.current === controller && cronProfileForScope($profileScope.get()) === viewProfile) {
        notifyError(err, c.failedTrigger)
      }
    }
  }

  // Throws on failure — ConfirmDialog reports it inline and stays open.
  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return
    }

    const { refreshError, stale } = await mutateAndRefreshCronJobs(profile, () => deleteCronJob(pendingDelete.id))

    if (stale) {
      return
    }

    if (refreshError) {
      notifyError(refreshError, c.failedLoad)
    }

    notify({ kind: 'success', title: c.deleted, message: truncate(jobTitle(pendingDelete), 60) })
  }

  async function handleEditorSave(values: EditorValues) {
    if (editor.mode === 'create') {
      const {
        value: created,
        refreshError,
        stale
      } = await mutateAndRefreshCronJobs(profile, () =>
        createCronJob({
          prompt: values.prompt,
          schedule: values.schedule,
          name: values.name || undefined,
          deliver: values.deliver || DEFAULT_DELIVER,
          ...(values.model.trim() ? { model: values.model.trim(), provider: values.provider.trim() || undefined } : {})
        })
      )

      if (stale || !created) {
        return
      }

      if (refreshError) {
        notifyError(refreshError, c.failedLoad)
      }

      notify({ kind: 'success', title: c.created, message: truncate(jobTitle(created), 60) })
    } else if (editor.mode === 'edit') {
      const scriptOnlyJob = jobIsScriptOnly(editor.job)

      const {
        value: updated,
        refreshError,
        stale
      } = await mutateAndRefreshCronJobs(profile, () =>
        updateCronJob(editor.job.id, cronEditorUpdates(values, { scriptOnlyJob }))
      )

      if (stale || !updated) {
        return
      }

      if (refreshError) {
        notifyError(refreshError, c.failedLoad)
      }

      notify({ kind: 'success', title: c.updated, message: truncate(jobTitle(updated), 60) })
    }

    setEditor({ mode: 'closed' })
  }

  // Blueprint instantiation is a distinct backend path (fills typed slots, then
  // creates the job) so it can't share the raw-cron onSave contract. Merge the
  // created job into $cronJobs like every other create path. A blueprint writes a
  // real per-profile job, and "all" is not a writable target — collapse it to
  // 'default', matching the manual create path in handleEditorSave.
  async function handleBlueprintCreate(blueprint: AutomationBlueprint, values: Record<string, string>) {
    const writableProfile = profileScope === ALL_PROFILES ? 'default' : profileScope

    const {
      value: job,
      refreshError,
      stale
    } = await mutateAndRefreshCronJobs(profile, () =>
      instantiateAutomationBlueprint({ blueprint: blueprint.key, values }, writableProfile)
    )

    if (stale || !job) {
      return
    }

    if (refreshError) {
      notifyError(refreshError, c.failedLoad)
    }

    notify({ kind: 'success', title: c.blueprints.scheduled, message: asText(job.schedule_display) || blueprint.title })
    setEditor({ mode: 'closed' })
  }

  return (
    <Panel closeLabel={c.close} onClose={onClose}>
      <PanelHeader subtitle={c.count(totalCount)} title={c.title} />

      {loading && jobs.length === 0 ? (
        <PageLoader label={c.loading} />
      ) : totalCount === 0 && visibleBlueprints.length === 0 ? (
        <PanelEmpty
          action={
            <Button onClick={() => setEditor({ mode: 'create' })} size="sm">
              {c.newCron}
            </Button>
          }
          description={c.emptyDescNew}
          icon="watch"
          title={c.emptyTitleNew}
        />
      ) : (
        <PanelBody>
          <PanelList
            onSearchChange={setQuery}
            searchHints={jobs
              .map(jobTitle)
              .filter(Boolean)
              .slice(0, 5)
              .map(title => t.common.tryHint(title))}
            searchLabel={c.search}
            searchPlaceholder={c.search}
            searchValue={query}
          >
            {visibleJobs.map(job => (
              <CronJobListRow
                active={selectedJob?.id === job.id}
                job={job}
                key={job.id}
                menuItems={[
                  { icon: 'edit', label: c.edit, onSelect: () => setEditor({ mode: 'edit', job }) },
                  { icon: 'trash', label: t.common.delete, onSelect: () => setPendingDelete(job), tone: 'danger' }
                ]}
                menuLabel={c.manage}
                onSelect={() => setSelectedJobId(job.id)}
              />
            ))}
            {visibleJobs.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {query.trim() ? c.emptyTitleSearch : c.emptyTitleNew}
              </p>
            )}
            <PanelAddButton label={c.newCron} onClick={() => setEditor({ mode: 'create' })} />
            {visibleBlueprints.length > 0 && (
              <>
                <PanelSectionLabel className="mt-3 px-2">{c.blueprints.tab}</PanelSectionLabel>
                {visibleBlueprints.map(item => (
                  <PanelListRow
                    active={false}
                    icon="rocket"
                    key={item.key}
                    onSelect={() => setEditor({ blueprintKey: item.key, mode: 'create' })}
                    rowKey={`blueprint-${item.key}`}
                    title={item.title}
                  />
                ))}
              </>
            )}
          </PanelList>

          {selectedJob ? (
            <CronJobDetail
              busy={busyJobTokens.has(selectedJob.id) || triggeringJobKeys.has(`${profile}:${selectedJob.id}`)}
              c={c}
              job={selectedJob}
              onOpenSession={onOpenSession}
              onPauseResume={() => void handlePauseResume(selectedJob)}
              onTrigger={() => void handleTrigger(selectedJob)}
            />
          ) : query.trim() ? (
            // A search with no selected job: search-flavored copy is right.
            <PanelEmpty description={c.emptyDescSearch} icon="search" />
          ) : (
            // No selection and no search — "Try a broader search query" here
            // just confused people staring at an empty panel with zero jobs.
            <PanelEmpty
              description={c.emptyDescNew}
              icon="watch"
              title={jobs.length === 0 ? c.emptyTitleNew : undefined}
            />
          )}
        </PanelBody>
      )}

      <CronEditorDialog
        editor={editor}
        onBlueprintCreate={handleBlueprintCreate}
        onClose={() => setEditor({ mode: 'closed' })}
        onSave={handleEditorSave}
      />

      <ConfirmDialog
        busyLabel={c.deleting}
        confirmLabel={t.common.delete}
        description={
          pendingDelete ? (
            <>
              {c.deleteDescPrefix}
              <span className="font-medium text-foreground">{truncate(jobTitle(pendingDelete), 60)}</span>
              {c.deleteDescSuffix}
            </>
          ) : null
        }
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        open={pendingDelete !== null}
        title={c.deleteTitle}
      />
    </Panel>
  )
}

S01|trajectory_ok|§R11.7 S01 steps 1-5 bind main, register send, pump, then subscribe from_cursor=0, with an owner and a delete-consequence on each row|nothing
S02|trajectory_broken|step 3 subscribe(tool_event_id), and steps 4-5 invoke conversation_id and approval_id|step 2 announce names kinds and supplies no local_id; §R11.3 and §R11.1 return ExplicitAbsent for an id that is not announced, so the claimed live delivery and send/approve invokes cannot occur
S03|trajectory_broken|step 1 subscribe(job_id, from_cursor=0)|this self-contained table never opens a namespace or announces job_id; §R11.3 returns ExplicitAbsent, so the leave/return catch-up in steps 2-4 never starts
S04|trajectory_ok|§R11.7 S04 steps 1-6, including in-handler announce and head pump before Result, subscribe at 0, and retire onEnd|nothing
S05|trajectory_ok|§R11.7 S05 steps 1-7 bind app.conf, register read, list, invoke, and walk|nothing
S06|trajectory_ok|§R11.7 S06 steps 1-6 open two namespaces, register per ns, and return ScopeDenied plus a scoped directory_list|nothing
S07|trajectory_broken|step 6 opaque payload render|no row registers read or pumps a payload, so step 5's only guaranteed outcome is CapabilityAbsent(read); the opaque row is not reached by this table
S08|trajectory_broken|step 9 further scope operations report NamespaceGone|NamespaceGone is only a pump raise after teardown (§R11.6 item 7); it is not an InvokeOutcome, and §R11.4 withholds OutcomeUnknown once the namespace is torn down, so the claimed scope result is undefined
S09|trajectory_broken|step 1 invoke(id, execute) feeding step 2 OutcomeUnknown|id is never announced; §R11.1 returns ExplicitAbsent for a never-announced resource, so the drop cannot produce OutcomeUnknown
S10|insufficient_evidence|§R11.7 S10 steps 1-2|step 1 names neither a resource id nor from_cursor, and no row assigns an owner to release subscriptions on crash without the unmount in step 3; a bound subscribe plus a crash-release owner would settle it
S11|trajectory_broken|step 4 invoke(job, cancel) claimed to return CapabilityAbsent|the announce row passes no local_id and does not bind job; §R11.1 returns ExplicitAbsent, which is not the CapabilityAbsent rendering step 5 claims
S12|trajectory_ok|§R11.7 S12 steps 1-5 teardown one namespace, release claims with on_claim_changed, and reopen under a new ns_id|nothing

# lib/validate.sh — output-contract validation. Nothing here trusts the model:
# a phase passes only if every declared output section is present, parses and
# satisfies its field grammar. Anything else is outcome=bad, never outcome=ok.

FE_M_OUT_S='<<<FE-OUT-START>>>'; FE_M_OUT_E='<<<FE-OUT-END>>>'
FE_M_LED_S='<<<FE-LEDGER-START>>>'; FE_M_LED_E='<<<FE-LEDGER-END>>>'
FE_M_SCN_S='<<<FE-SCENARIO-START>>>'; FE_M_SCN_E='<<<FE-SCENARIO-END>>>'
FE_M_VER_S='<<<FE-VERDICT-START>>>'; FE_M_VER_E='<<<FE-VERDICT-END>>>'
FE_M_MECH_S='<<<FE-MECH-START>>>'; FE_M_MECH_E='<<<FE-MECH-END>>>'
FE_M_RPL_S='<<<FE-REPLAY-START>>>'; FE_M_RPL_E='<<<FE-REPLAY-END>>>'

fn_spec(){ # fn_spec <contract> <key> ; last ROLESPEC wins
  local c="$1" k="$2"
  awk -F'|' -v k="$k" '$1=="ROLESPEC" && $2==k {v=$3} END{print v}' "$c" 2>/dev/null
}
fn_sed_extract(){ # fn_sed_extract <content> <start> <end> <out>
  local cf="$1" s="$2" e="$3" o="$4"
  awk -v s="$s" -v e="$e" -v done=0 '
    index($0,s)>0 && done==0 {cap=1; done=1; next}
    cap==1 && index($0,e)>0 {cap=0; exit}
    cap==1 {print}
  ' "$cf" > "$o"
  [ -s "$o" ]
}
fn_wordcount(){ wc -w < "$1" | tr -d ' '; }

fn_vfail(){ printf '  invalid: %s\n' "$*" >> "$FE_TMP/validate.err"; return 1; }

# ---- ledger row grammar ------------------------------------------------------
fn_check_ledger(){ # fn_check_ledger <ledger-file> ; accepted rows -> $FE_TMP/ce.accepted
  local lf="$1" out="$FE_TMP/ce.accepted" raw line id rnd sev st inv refs
  mkdir -p "$FE_TMP"
  : > "$out"
  : > "$FE_TMP/ce.rejects"
  [ -s "$lf" ] || return 0   # an empty block means "no rows", judged by the caller
  while IFS= read -r raw; do
    # tolerate markdown bullets/quote prefixes, but the row must then start with an id
    line=$(printf '%s' "$raw" | sed -E 's/^[[:space:]]*([-*][[:space:]]+|>[[:space:]]+|[`|]+)+//; s/[`|]+[[:space:]]*$//')
    [ -n "$line" ] || continue
    case "$line" in FE-CE-*) : ;; *) continue ;; esac   # prose lines are ignored
    id=${line%%|*}
    case "$id" in
      FE-CE-[0-9][0-9][0-9]) : ;;
      *) fn_vfail "ledger id is not FE-CE-NNN: [$id]"; printf '%s\n' "$raw" >> "$FE_TMP/ce.rejects"; continue ;;
    esac
    IFS='|' read -r _ rnd sev st inv _title refs _rest <<< "$line"
    if [ "$(printf '%s' "$line" | awk -F'|' '{print NF}')" -lt 8 ]; then
      fn_vfail "ledger row $id needs 8 pipe fields (id|round|severity|status|invariant|title|evidence|targets)"; printf '%s\n' "$raw" >> "$FE_TMP/ce.rejects"; continue
    fi
    case "$rnd" in NEW|*[0-9]) : ;; *) fn_vfail "ledger row $id: bad round [$rnd]"; continue ;; esac
    case "$sev" in major|minor) : ;; *) fn_vfail "ledger row $id: bad severity [$sev]"; continue ;; esac
    case "$st" in OPEN|CLOSED|DISPUTED|REJECTED|SUPERSEDED) : ;; *) fn_vfail "ledger row $id: bad status [$st]"; continue ;; esac
    [ -n "$(printf '%s' "$inv" | tr -dc 'A-Za-z0-9')" ] || { fn_vfail "ledger row $id: empty invariant"; continue; }
    printf '%s\n' "$line" >> "$out"
  done < "$lf"
  [ -s "$FE_TMP/validate.err" ] && return 1
  return 0
}

fn_block_present(){ # <content> <start> <end>
  awk -v s="$2" -v e="$3" '
    index($0,s)>0 && !seen {seen=1; next}
    seen && index($0,e)>0 {found=1; exit}
    END{exit found?0:1}' "$1"; }
fn_norm(){ printf '%s' "$1" | sed -E 's/^[[:space:]]*([-*][[:space:]]+|>[[:space:]]+|[`|]+)+//; s/[`|]+[[:space:]]*$//'; }

# ---- scenario coverage table -------------------------------------------------
fn_check_scenarios(){ # fn_check_scenarios <file>
  local sf="$1" raw line sid st bad=0 n=0
  [ -s "$sf" ] || { fn_vfail "scenario table missing or empty"; return 1; }
  while IFS= read -r raw; do
    line=$(fn_norm "$raw")
    case "$line" in S[0-9][0-9]|*) : ;; *) continue ;; esac
    IFS='|' read -r sid st _rest <<< "$line"
    case "$sid" in S[0-9][0-9]) : ;; *) fn_vfail "bad scenario id [$sid]"; bad=1 ;; esac
    case "$st" in covered|partial|open) : ;; *) fn_vfail "bad scenario status [$st] for $sid"; bad=1 ;; esac
    n=$((n+1))
  done < "$sf"
  [ "$n" -gt 0 ] || { fn_vfail "scenario table had no S0x rows"; return 1; }
  return $bad
}

# ---- verdict table -----------------------------------------------------------
# Verdict rows come in two kinds and are split into different files, because a
# verdict is what binds a claim to an independent judgement. Output shape alone
# never closes anything.
#   FE-CE-NNN|holds|does_not_hold|insufficient_evidence|pass|fail   -> $4  (ce)
#   S0x     |trajectory_ok|trajectory_broken|insufficient_evidence  -> $5  (scenario)
# <file> [kinds] [ce-status-set] [sc-status-set]
# kinds      — which id shapes this role may rule at all (ce, sc, or both)
# status set — which verdict words are legal for each id shape, per call site:
#              a ruling block and a replay block share the id column but not the
#              vocabulary, and conflating them let "pass|fail" be read as kinds
fn_check_verdicts(){
  local vf="$1" kinds="${2:-ce+sc}" ce_ok="${3:-holds|does_not_hold|insufficient_evidence}" sc_ok="${4:-trajectory_ok|trajectory_broken|insufficient_evidence}" raw line id st bad=0 nce=0 nsc=0
  # output files are per call site: the reviewer's contract runs this twice
  # (verdict block, then replay block) and a shared file made the second call
  # erase the first call's twelve scenario rulings
  local oce="${VERDICT_CE_OUT:-$FE_TMP/verdict.ce}" osc="${VERDICT_SC_OUT:-$FE_TMP/verdict.sc}"
  : > "$oce"; : > "$osc"
  [ -s "$vf" ] || { fn_vfail "verdict table missing or empty"; return 1; }
  while IFS= read -r raw; do
    line=$(fn_norm "$raw")
    case "$line" in FE-CE-[0-9][0-9][0-9]|*|S[0-9][0-9]|*) : ;; *) continue ;; esac
    IFS='|' read -r id st _rest <<< "$line"
    st=$(printf '%s' "$st" | tr -d ' ')
    case "$id" in
      FE-CE-[0-9][0-9][0-9])
        case "$kinds" in *ce*) : ;; *) fn_vfail "verdict $id: this role may not rule counterexamples here"; bad=1; continue ;; esac
        if printf '%s' "$st" | grep -Eq "^($ce_ok)$"; then
          printf '%s\n' "$line" >> "$oce"; nce=$((nce+1))
        else
          fn_vfail "verdict $id: status [$st] is not one of {$ce_ok}"; bad=1
        fi ;;
      S[0-9][0-9])
        case "$kinds" in *sc*) : ;; *) fn_vfail "verdict $id: this role may not rule scenarios here (it rules: $kinds)"; bad=1; continue ;; esac
        if printf '%s' "$st" | grep -Eq "^($sc_ok)$"; then
          printf '%s\n' "$line" >> "$osc"; nsc=$((nsc+1))
        else
          fn_vfail "verdict $id: status [$st] is not one of {$sc_ok}"; bad=1
        fi ;;
    esac
  done < "$vf"
  [ $((nce+nsc)) -gt 0 ] || fn_vfail "verdict block had no valid rows"
  [ "$bad" -eq 0 ]
}

# ---- the phase gate ----------------------------------------------------------
fn_section_count(){ # fn_section_count <content>
  awk -v s="$FE_M_OUT_S" 'index($0,s)>0 {n++} END{print n+0}' "$1"; }
fn_section(){ # fn_section <content> <nth> <out>
  local cf="$1" n="$2" o="$3"
  awk -v s="$FE_M_OUT_S" -v e="$FE_M_OUT_E" -v n="$n" '
    index($0,s)>0 && cap==0 { cnt++; if (cnt==n) cap=1; next }
    cap==1 && index($0,e)>0 { cap=0; exit }
    cap==1 { print }
  ' "$cf" > "$o"
  [ -s "$o" ]
}

fn_validate_phase(){ # fn_validate_phase <phase> <contract> <content-file>
  local phase="$1" cf="$2" content="$3"
  local outs n want minw outpath rc=0 allow_none none_ok=0 extra i outname need m
  mkdir -p "$FE_TMP"
  : > "$FE_TMP/validate.err"

  n=$(fn_section_count "$content")
  want=$(awk -F'|' '$1=="OUTPUT" {c++} END{print c+0}' "$cf")
  outs=$(awk -F'|' '$1=="OUTPUT" {print $2}' "$cf" | tr '\n' ' ')
  [ -n "$outs" ] || fn_die "contract $cf declares no OUTPUT"
  minw=$(fn_spec "$cf" min_words); : "${minw:=200}"

  if [ "$n" -lt "$want" ]; then
    fn_vfail "found $n output section(s), contract declares $want (each needs $FE_M_OUT_S / $FE_M_OUT_E lines)"
  else
    local i=1
    while [ "$i" -le "$want" ]; do
      outpath="$FE_TMP/sec.$i"
      fn_section "$content" "$i" "$outpath" \
        || fn_vfail "output section #$i empty or missing"
      if [ -s "$outpath" ] && [ "$(fn_wordcount "$outpath")" -lt "$minw" ]; then
        fn_vfail "output section #$i below $minw words"
      fi
      i=$((i+1))
    done
  fi

  # a named declaration is a stronger demand than a word count: it asks for the
  # specific check to be stated, and states which one
  need=$(fn_spec "$cf" require_lines)
  if [ -n "$need" ]; then
    IFS=',' read -r -a _marks <<< "$need"
    for m in "${_marks[@]}"; do
      [ -n "$m" ] || continue
      grep -q "$m" "$content" || fn_vfail "required declaration line missing: $m"
    done
  fi
  # "prove it with a model, not prose" has to be countable or it decays quietly:
  # R007 shipped 3 experiments and a single typed signature after R006 had 10
  nexp=$(fn_spec "$cf" require_experiments); : "${nexp:=0}"
  if [ "$nexp" -gt 0 ] 2>/dev/null; then
    got=$(grep -c '^```python' "$content")
    [ "$got" -ge "$nexp" ] || fn_vfail "contract requires at least $nexp executable model experiments; found $got"
  fi
  nsig=$(fn_spec "$cf" require_signatures); : "${nsig:=0}"
  if [ "$nsig" -gt 0 ] 2>/dev/null; then
    got=$(grep -cE '^[[:space:]]*(interface|type|func|operation|class)[[:space:]]+[A-Za-z_]|->|:[[:space:]]*[A-Z][A-Za-z]*[[:space:]]*(\||$)' "$content")
    [ "$got" -ge "$nsig" ] || fn_vfail "contract requires at least $nsig typed interface lines; found $got"
  fi
  extra=$(fn_spec "$cf" extra)
  allow_none=$(fn_spec "$cf" allow_none)
  none_ok=0
  if [ "$allow_none" = "1" ] && grep -Eqi '^[[:space:]]*(\*\*)?COUNTEREXAMPLES:[[:space:]]*(\*\*)?[[:space:]]*none[[:space:]]*$' "$content"; then
    none_ok=1
    : > "$FE_TMP/ce.accepted"
    fn_note "validate[$phase]: attacker declared no counterexample (COUNTEREXAMPLES: none)"
  fi
  for spec in $(printf '%s' "$extra" | tr '+' ' '); do
    case "$spec" in
      ledger)
        if [ "$none_ok" = 1 ]; then : > "$FE_TMP/ce.accepted"; continue; fi
        if ! fn_block_present "$content" "$FE_M_LED_S" "$FE_M_LED_E"; then
          fn_vfail "no ledger block at all ($FE_M_LED_S ... $FE_M_LED_E)"
        else
          fn_sed_extract "$content" "$FE_M_LED_S" "$FE_M_LED_E" "$FE_TMP/ce.raw"
          fn_check_ledger "${FE_TMP:-.}/ce.raw"
        fi
        # allow_none excuses declaring nothing; it never excuses a block whose
        # every row was malformed — that is a contract violation, not an absence
        if [ ! -s "$FE_TMP/ce.accepted" ]; then
          fn_vfail "ledger block present but contained no valid rows"
        fi ;;
      scenario)
        fn_sed_extract "$content" "$FE_M_SCN_S" "$FE_M_SCN_E" "$FE_TMP/sc.raw" \
          && fn_check_scenarios "$FE_TMP/sc.raw" \
          || fn_vfail "no valid scenario table block ($FE_M_SCN_S ... $FE_M_SCN_E)" ;;
      verdict)
        vkinds=$(fn_spec "$cf" verdict_kinds); : "${vkinds:=ce+sc}"
        req=$(fn_spec "$cf" require_scenarios); : "${req:=0}"
        fn_sed_extract "$content" "$FE_M_VER_S" "$FE_M_VER_E" "$FE_TMP/verdict.raw" \
          && fn_check_verdicts "$FE_TMP/verdict.raw" "$vkinds" \
          || fn_vfail "no valid verdict block ($FE_M_VER_S ... $FE_M_VER_E)"
        # a review that skips scenarios is worth nothing: every one of them must
        # be ruled, which is a stricter demand than any word count
        if [ "$req" -gt 0 ] 2>/dev/null; then
          got=$(awk -F'|' '{print $1}' "$FE_TMP/verdict.sc" 2>/dev/null | grep -E '^S[0-9]{2}$' | sort -u | wc -l | tr -d ' ')
          [ "$got" -ge "$req" ] \
            || fn_vfail "this role must rule at least $req scenarios; it ruled $got"
        fi ;;
      mech)
        fn_sed_extract "$content" "$FE_M_MECH_S" "$FE_M_MECH_E" "$FE_TMP/mech.raw" \
          || fn_vfail "no mechanism block ($FE_M_MECH_S ... $FE_M_MECH_E)" ;;
      replay)
        if [ -n "$(fn_regression_list 2>/dev/null)" ]; then
          fn_sed_extract "$content" "$FE_M_RPL_S" "$FE_M_RPL_E" "$FE_TMP/replay.raw" \
            && VERDICT_CE_OUT="$FE_TMP/replay.ce" VERDICT_SC_OUT="$FE_TMP/replay.sc" \
                 fn_check_verdicts "$FE_TMP/replay.raw" ce 'pass|fail' \
            || fn_vfail "regression set is non-empty and no replay block was produced"
        else
          : > "$FE_TMP/replay.raw"
        fi ;;
      *) : ;;
    esac
  done

  if [ -s "$FE_TMP/validate.err" ]; then
    rc=1
    while IFS= read -r line; do fn_note "validate[$phase]: $line"; done < "$FE_TMP/validate.err"
  fi
  return $rc
}

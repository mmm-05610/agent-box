# lib/ledger.sh — the permanent counterexample record. Rows are only ever added
# or transitioned; nothing deletes history. Model-proposed ids are remapped to
# canonical ids so a reused or colliding id can never overwrite a live row, and
# cross-references are rewritten through the same map.

FE_CE_NEXT="$FE_RUN/ce_next"

fn_ce_next_ensure(){ [ -f "$FE_CE_NEXT" ] || printf '1\n' > "$FE_CE_NEXT"; }
fn_ce_next_get(){ fn_ce_next_ensure; sed -n '1p' "$FE_CE_NEXT" | tr -dc '0-9'; }
fn_ce_next_set(){ printf '%s\n' "$1" > "$FE_CE_NEXT"; sync "$FE_CE_NEXT" 2>/dev/null || true; }

fn_ledger_ensure(){
  fn_reserve_path "$FE_LEDGER"
  [ -f "$FE_LEDGER" ] || printf '%s\n' "$FE_CE_COLS" > "$FE_LEDGER"
  [ -f "$FE_SC" ] || printf 'sid|status|owner|mechanism|evidence|round\n' > "$FE_SC"
}

# fn_ce_merge <accepted-rows-file> <round-id>
# accepted row: FE-CE-NNN|raised_round|severity|status|invariant|title|evidence|targets
fn_ce_merge(){
  local in="$1" rnd="$2" work map id sev st inv title ev targets nid next line
  fn_ledger_ensure
  [ -s "$in" ] || return 0
  work="$FE_TMP/ce.work.$$"
  map="$FE_TMP/ce.map.$$"
  cp "$FE_LEDGER" "$work"
  : > "$map"
  next=$(fn_ce_next_get)

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    IFS='|' read -r id rnd_field sev st inv title ev targets <<< "$line"
    : "${rnd_field:=$rnd}"
    if grep -q "^$id|" "$work"; then
      # transition an existing row: status/evidence/targets may change, severity
      # may only be escalated minor->major, never downgraded.
      local nxt="$FE_TMP/ce.row.$$"
      awk -F'|' -v OFS='|' -v id="$id" -v st="$st" -v ev="$ev" -v tg="$targets" -v sev="$sev" '
        NR==1 || $1!=id {print; next}
        {
          $4=st
          $7=($7=="" || $7=="-") ? ev : ($7 " ; " ev)
          if ($3!="major" && sev=="major") $3="major"
          if ($9=="") $9="-"
          print
        }' "$work" > "$nxt" && mv "$nxt" "$work"
      continue
    fi
    nid=$(printf 'FE-CE-%03d' "$next")
    next=$((next+1))
    printf '%s|%s\n' "$id" "$nid" >> "$map"
    printf '%s|%s|%s|%s|%s|%s|%s|%s|-\n' \
      "$nid" "$(fn_scrub "$rnd_field")" "$(fn_scrub "$sev")" "$(fn_scrub "$st")" \
      "$(fn_scrub "$inv")" "$(fn_scrub "$title")" "$(fn_scrub "$ev")" "$(fn_scrub "$targets")" >> "$work"
  done < "$in"

  # rewrite proposed refs to canonical ids in the targets column of every row
  if [ -s "$map" ]; then
    local nxt="$FE_TMP/ce.row2.$$"
    awk -F'|' -v OFS='|' '
      NR==FNR { prop[$1]=$2; next }            # map: proposed|canonical
      FNR==1  { print; next }
      {
        if ($8 != "" && $8 != "-") {
          n = split($8, a, /;[ ]*/)
          out = ""
          for (i = 1; i <= n; i++) {
            t = a[i]; if (t in prop) t = prop[t]
            out = (out == "" ? t : out "; " t)
          }
          $8 = out
        }
        print
      }
    ' "$map" "$work" > "$nxt" && mv "$nxt" "$work"
    : > "$FE_TMP/ce.remap-report"
    while IFS='|' read -r prop canon; do printf '%s -> %s\n' "$prop" "$canon" >> "$FE_TMP/ce.remap-report"; done < "$map"
    if [ -n "${FE_CE_MAP:-}" ]; then
      cat "$map" >> "$FE_CE_MAP"          # proposed|canonical, per round
      cp "$map" "$(dirname "$in")/id-map.tsv" 2>/dev/null || true
    fi
  fi

  fn_ce_next_set "$next"
  fn_atomic "$FE_LEDGER" "$work"
  rm -f "$map"
  return 0
}

fn_ce_resolve(){ # <proposed id> -> canonical id mapped this round, else unchanged
  local p="$1" c
  { [ -n "${FE_CE_MAP:-}" ] && [ -f "${FE_CE_MAP:-}" ]; } || { printf '%s' "$p"; return 0; }
  c=$(awk -F'|' -v k="$p" '$1==k{print $2}' "$FE_CE_MAP" | tail -1)
  if [ -n "$c" ]; then printf '%s' "$c"; else printf '%s' "$p"; fi
}

fn_ce_set_status(){ # fn_ce_set_status <id> <status> [evidence-append]
  local id="$1" st="$2" ev="${3:-}" nxt="$FE_TMP/ce.st.$$"
  fn_ledger_ensure
  awk -F'|' -v OFS='|' -v id="$id" -v st="$st" -v ev="$ev" '
    NR==1 || $1!=id {print; next}
    { $4=st; if (ev!="") $7=($7=="" ? ev : $7 " ; " ev); if($9=="")$9="-"; print }
  ' "$FE_LEDGER" > "$nxt" && fn_atomic "$FE_LEDGER" "$nxt"
}
fn_ce_set_replayed(){ # fn_ce_set_replayed <id> <round>
  local id="$1" rnd="$2" nxt="$FE_TMP/ce.rp.$$"
  fn_ledger_ensure
  awk -F'|' -v OFS='|' -v id="$id" -v rnd="$rnd" '
    NR==1 || $1!=id {print; next}
    { $9=rnd; print }
  ' "$FE_LEDGER" > "$nxt" && fn_atomic "$FE_LEDGER" "$nxt"
}

# ---------------------------------------------------------------- digests ----
# The saved candidate's bytes are the anchor for every independent ruling.
fn_best_digest(){
  local f="$FE_RUN/candidates/best.md" out="$FE_RUN/candidates/best.digest" cur
  [ -s "$f" ] || { printf 'no-candidate'; return 1; }
  cur=$(fn_sha "$f")
  if [ -z "$cur" ]; then
    printf 'digest-uncomputable\n' >&2
    return 1
  fi
  printf '%s %s\n' "$cur" "$(date -u +%FT%TZ)" > "$out" 2>/dev/null || true
  printf '%s' "$cur"
}
FE_RULINGS="$FE_RUN/review-rulings.tsv"
fn_rulings_ensure(){ [ -f "$FE_RULINGS" ] || printf 'round|digest|kind|id|verdict|evidence\n' | fn_write "$FE_RULINGS"; }
# rows are selected by field shape, not by line number, so a record that lost
# its header line is still read correctly
fn_ruling(){ # <kind> <id> <digest> -> newest verdict for that pair, or empty
  local f="$FE_RULINGS"
  # an empty or placeholder digest would match every row, which is how a
  # candidate could silently inherit someone else's verdicts
  [ -n "${3:-}" ] || return 0
  case "$3" in no-candidate|digest-uncomputable) return 0 ;; esac
  [ -f "$f" ] || return 0
  awk -F'|' -v k="$1" -v id="$2" -v d="$3" '$2!="" && $2==d && $3==k && $4==id{v=$5} END{print v}' "$f"
}
fn_rulings_for_digest(){
  local d="$1"
  [ -f "$FE_RULINGS" ] || return 0
  awk -F'|' -v d="$d" '$2==d && $1!="round"' "$FE_RULINGS"
}

# regression set = everything that must still hold against the next candidate
# Attribution: a defect found in a candidate that is no longer the saved one
# must not block the saved candidate, and setting that candidate aside is not a
# repair of it. Unknown attribution is treated as blocking (conservative).
#   subject values: A-lineage | B-alternative | host | unassigned
fn_ce_subject(){ # <id>
  local f="$FE_LEDGER"; [ -f "$f" ] || return 0
  awk -F'|' -v i="$1" '$1==i{print $10}' "$f" | tail -1; }
fn_ce_set_subject(){ # <id> <subject> <note>
  local id="$1" sub="$2" note="$3" nxt="$FE_TMP/ce.sub.$$"
  awk -F'|' -v OFS='|' -v id="$id" -v s="$sub" -v n="$note" '
    NR==1 { if (NF<10) {print $0"|subject|subject_note"} else print; next }
    { if (NF<10) { $10="unassigned"; $11="-" }
      if ($1==id) { $10=s; $11=($11=="-"? n : $11 " ; " n) }
      print }' "$FE_LEDGER" > "$nxt" && fn_atomic "$FE_LEDGER" "$nxt"
}

fn_regression_list(){
  local f="$FE_LEDGER"; [ -f "$f" ] || return 0
  awk -F'|' 'NR>1 && ($4=="OPEN" || $4=="DISPUTED" || ($4=="CLOSED" && $9=="-")) {print}' "$f"
}

# ---- scenario coverage --------------------------------------------------------
# model row: S01|covered|owner|mechanism|evidence
fn_sc_merge(){
  local in="$1" rnd="$2" work sid st owner mech ev line
  [ -s "$in" ] || return 0
  fn_ledger_ensure
  work="$FE_TMP/sc.work.$$"
  cp "$FE_SC" "$work"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    IFS='|' read -r sid st owner mech ev <<< "$line"
    case "$sid" in S[0-9][0-9]) : ;; *) continue ;; esac
    # an integrator may only claim coverage; "covered" is granted by an
    # independent review ruling bound to the saved candidate's bytes
    case "$st" in covered) st="claimed" ;; partial|open|claimed) : ;; *) st="partial" ;; esac
    local nxt="$FE_TMP/sc.row.$$"
    if grep -q "^$sid|" "$work"; then
      awk -F'|' -v OFS='|' -v sid="$sid" -v st="$st" -v o="$owner" -v m="$mech" -v e="$ev" -v r="$rnd" '
        NR==1 || $1!=sid {print; next}
        { $2=st;$3=o;$4=m;$5=e;$6=r; print }' "$work" > "$nxt" && mv "$nxt" "$work"
    else
      printf '%s|%s|%s|%s|%s|%s\n' "$sid" "$st" "$(fn_scrub "$owner")" "$(fn_scrub "$mech")" "$(fn_scrub "$ev")" "$rnd" >> "$work"
    fi
  done < "$in"
  fn_atomic "$FE_SC" "$work"
  return 0
}

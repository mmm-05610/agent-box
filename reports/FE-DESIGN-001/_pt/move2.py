names = ['fn_candidate_ids','fn_round_dimension','fn_commit_phase','fn_cp_snapshot']
lines = open('lib/phases.sh').read().split('\n')
out, blocks = [], {}
i = 0
while i < len(lines):
    hit = next((n for n in names if lines[i].startswith(n+'()')), None)
    if hit:
        start = i
        while start > 0 and lines[start-1].lstrip().startswith('#'):
            start -= 1
        j = i
        while j < len(lines) and lines[j] != '}':
            j += 1
        blocks[hit] = lines[start:j+1]
        i = j + 1
        continue
    out.append(lines[i]); i += 1
assert sorted(blocks) == sorted(names), sorted(blocks)
open('lib/phases.sh','w').write('\n'.join(out))
h = open('lib/handoff.sh').read().split('\n')
anchor = "# ---- committing a role's accepted output"
k = next(n for n,l in enumerate(h) if l.startswith(anchor))
ins = ['# ---- helpers the commits need (moved out of the retired supervisor)','']
for n in names:
    ins += blocks[n] + ['']
open('lib/handoff.sh','w').write('\n'.join(h[:k] + ins + h[k:]))
print('moved all four')

names = ['fn_candidate_ids','fn_commit_phase','fn_cp_snapshot','fn_round_dimension']
lines = open('lib/phases.sh').read().split('\n')
blocks = {}
i = 0
while i < len(lines):
    for n in names:
        if lines[i].startswith(n + '(){') or lines[i].startswith(n + '() {'):
            j = i
            while j < len(lines) and lines[j] != '}':
                j += 1
            # include any preceding comment line(s)
            k = i
            while k > 0 and lines[k-1].lstrip().startswith('#'):
                k -= 1
            blocks[n] = '\n'.join(lines[k:j+1])
            lines[k:j+1] = []
            i = k
            break
    i += 1
assert len(blocks) == 4, blocks.keys()
open('lib/phases.sh','w').write('\n'.join(lines))
h = open('lib/handoff.sh').read()
anchor = "# ---- committing a role's accepted output"
assert anchor in h
h = h.replace(anchor, '# ---- helpers the commits need (moved out of the retired supervisor)\n\n'
              + '\n\n'.join(blocks[n] for n in names) + '\n\n' + anchor, 1)
open('lib/handoff.sh','w').write(h)
print('moved:', sorted(blocks))

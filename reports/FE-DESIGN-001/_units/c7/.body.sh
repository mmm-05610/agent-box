printf 'S01|covered|core|projection|integration 1\n' > "$FE_TMP/sc.txt"
fn_sc_merge "$FE_TMP/sc.txt" R001
echo "status1=$(awk -F'|' 'NR==2{print $2}' "$FE_SC")"

#!/bin/bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
declare -a Q=(
"q02|beginner tips tricks quality of life"
"q03|hold E to collect foliage"
"q04|inventory management early game full"
"q05|power slug where to use overclock first"
"q06|somersloop what to use it on early"
"q07|dimensional depot what to put in"
"q09|hard drive early which alternate recipe first"
"q10|biomass burner leaves feed belt container"
"q11|where to build first base location"
"q12|moving base regret starting area"
"q13|common beginner mistakes"
"q14|what not to do early game waste of time"
"q16|power shard save or use early"
"q17|blade runners quality of life early"
"q18|things I wish I knew sooner"
"q19|dimensional depot game changer"
)
for e in "${Q[@]}"; do
  id="${e%%|*}"; q="${e#*|}"
  enc=$(printf '%s' "$q" | sed 's/ /%20/g')
  out="${id}_top.xml"
  if [ ! -s "$out" ]; then
    code=$(curl -sL -A "$UA" "https://www.reddit.com/r/SatisfactoryGame/search.rss?q=${enc}&restrict_sr=1&sort=top&t=all&limit=50" -o "$out" -w "%{http_code}")
    sz=$(stat -c%s "$out" 2>/dev/null)
    echo "$id HTTP=$code bytes=$sz"
    [ "$code" != "200" ] && rm -f "$out"
    sleep 70
  fi
done
echo "RSS_DONE"

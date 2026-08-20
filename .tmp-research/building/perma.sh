#!/bin/bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
D=/c/Dev/satisfactory-ops/.tmp-research/building/perma
mkdir -p "$D"
# wait for rss batch to finish
for i in $(seq 1 60); do grep -q DONE /c/Dev/satisfactory-ops/.tmp-research/building/rss/log.txt 2>/dev/null && break; sleep 20; done
for id in 1g8ui9f 1djhaxj 1u7e43q b468ix 1kaj1we 1o5ozlx 111tl4u 1g3dzk8 1imqmxa 1g4cng0 1s0p6fl 1cu220r 1o78hda 1ivveze 1f7bgaa dp9k2y 1fmtqmw 186tl2y 1nzwu2j 1nakn5v 1u5mp0b 1fj50io 1lf8w93 1j7ashc 1h1jqh2 1nm8n00; do
  [ -s "$D/$id.html" ] && continue
  curl -s -m 45 -A "$UA" "https://old.reddit.com/r/SatisfactoryGame/comments/$id/?sort=top" -o "$D/$id.html" -w "$id HTTP %{http_code} %{size_download}\n" >> "$D/log.txt"
  sz=$(stat -c%s "$D/$id.html" 2>/dev/null || echo 0)
  [ "$sz" -lt 20000 ] && rm -f "$D/$id.html"
  sleep 50
done
echo PERMA_DONE >> "$D/log.txt"

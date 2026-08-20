#!/bin/bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
D=/c/Dev/satisfactory-ops/.tmp-research/building/rss
mkdir -p "$D"
i=0
while IFS= read -r q; do
  [ -z "$q" ] && continue
  i=$((i+1))
  slug=$(echo "$q" | tr ' ' '_' | tr -cd 'a-zA-Z0-9_')
  enc=$(echo "$q" | sed 's/ /%20/g')
  curl -s -m 40 -A "$UA" "https://old.reddit.com/r/SatisfactoryGame/search.rss?q=${enc}&restrict_sr=1&sort=top&t=all&limit=25" -o "$D/${i}_${slug}.xml" -w "$i $slug HTTP %{http_code} %{size_download}\n" >> "$D/log.txt"
  sleep 24
done <<'QUERIES'
building tips
tips and tricks
quality of life
hotkeys
nudge
zoop
blueprint tips
blueprint designer
foundations first
how do you build
base design
factory design tips
things I wish I knew
common mistakes
beginner mistakes
belt routing
conveyor lift
power pole placement
priority power switch
signs labels
color coding factory
aesthetic building
vertical factory
modular factory
mass dismantle
undo button
soft clearance
build gun
map markers
hypertube
pipe head lift
what do you regret
make factory look good
snapping guidelines
copy settings eyedropper
QUERIES
echo DONE >> "$D/log.txt"

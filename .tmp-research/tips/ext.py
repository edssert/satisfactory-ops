import re,html,sys
p=sys.argv[1]
s=open(p,encoding='utf-8',errors='ignore').read()
# title
t=re.search(r'<div class="workshopItemTitle">(.*?)</div>',s,re.S)
d=re.findall(r'<div class="detailsStatRight">(.*?)</div>',s,re.S)
a=re.search(r'class="friendBlockContent">\s*(.*?)\s*<',s,re.S)
print("TITLE:",html.unescape(t.group(1)).strip() if t else "?")
print("DATES:",[html.unescape(x).strip() for x in d])
print("AUTHOR:",html.unescape(a.group(1)).strip() if a else "?")
body=re.search(r'<div class="subSection detailBox">(.*)<div class="rightDetailsBlock',s,re.S)
if not body:
    body=re.search(r'id="profileBlock".*?(<div class="subSection.*)',s,re.S)
txt = body.group(1) if body else s
txt=re.sub(r'<script.*?</script>','',txt,flags=re.S)
txt=re.sub(r'<style.*?</style>','',txt,flags=re.S)
txt=re.sub(r'<br\s*/?>','\n',txt)
txt=re.sub(r'</(p|div|li|h[1-6])>','\n',txt)
txt=re.sub(r'<[^>]+>','',txt)
txt=html.unescape(txt)
txt=re.sub(r'\n{3,}','\n\n',txt)
print("----BODY----")
print(txt.strip()[:20000])

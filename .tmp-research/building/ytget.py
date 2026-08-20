import re,sys,glob
for f in sorted(glob.glob(sys.argv[1])):
    t=open(f,encoding='utf-8',errors='ignore').read()
    def g(p):
        m=re.search(p,t); return m.group(1) if m else '?'
    title=g(r'"title":\{"simpleText":"(.*?)"\}')
    if title=='?': title=g(r'<meta name="title" content="(.*?)"')
    desc=g(r'"shortDescription":"(.*?)","isCrawlable')
    date=g(r'"uploadDate":"(.*?)"'); views=g(r'"viewCount":"(\d+)"'); chan=g(r'"ownerChannelName":"(.*?)"')
    d=desc.encode().decode('unicode_escape',errors='ignore')
    # keep only timestamp lines + first 600 chars
    ts=[l for l in d.split('\n') if re.match(r'\s*\d{1,2}:\d{2}',l)]
    print('='*16,f); print('TITLE:',title.encode().decode('unicode_escape',errors='ignore'))
    print('CHAN:',chan,'| DATE:',date,'| VIEWS:',views)
    print('BLURB:',d[:500].replace('\n',' | '))
    if ts: print('CHAPTERS:'); print('\n'.join(ts))

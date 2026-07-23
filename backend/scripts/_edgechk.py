import json, numpy as np
PUB=r'F:\MAS-2\backend\public\m\lena-01'
m=json.load(open(PUB+r'\perio-cols.json',encoding='utf-8'))
E=m['edges']
for k in ('gumUp','gumLo','boneUp','boneLo'):
    a=np.array(E[k],float)
    nz=a[(a>0)]
    print(f'{k}: len {len(a)} min {a.min():.0f} max {a.max():.0f} median {np.median(a):.0f}')
    # sample every 150px
    print('   samples:', [int(a[x]) for x in range(100,1300,150)])

import sys, json, numpy as np
from PIL import Image
from scipy import ndimage
root=sys.argv[1]
man=json.load(open(f"{root}/manifest.json"))
res=[]
for f in man['files']:
    p=f"{root}/{f['path']}"; im=Image.open(p); a=np.array(im.convert('RGBA'))
    al=a[...,3]; m=al>16
    ys,xs=np.nonzero(m); x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
    w,h=x1-x0+1,y1-y0+1
    lab,n=ndimage.label(m); sizes=ndimage.sum(m,lab,range(1,n+1)) if n else []
    big=sum(1 for s in sizes if s>30)
    cx,cy=xs.mean(),ys.mean(); r=np.sqrt(m.sum()/np.pi)
    yy,xx=np.mgrid[:256,:256]; disk=(xx-cx)**2+(yy-cy)**2<=r*r
    iou=(disk&m).sum()/(disk|m).sum()
    # radial extent by angle -> roundness
    ang=np.arctan2(ys-cy,xs-cx); d=np.hypot(ys-cy,xs-cx)
    bins=np.digitize(ang,np.linspace(-np.pi,np.pi,73))
    rmax=[d[bins==b].max() for b in range(1,73) if (bins==b).any()]
    holes=(ndimage.binary_fill_holes(m)&~m).sum()
    semi=((al>0)&(al<250)).sum()
    res.append(dict(casino=f['casino'],d=f['denomination'],size=im.size,mode=im.mode,bbox_wh=(int(w),int(h)),
      pad=(int(x0),int(y0),int(255-x1),int(255-y1)),components=big,stray=int(n-big),iou=round(float(iou),4),
      rmin=round(min(rmax),1),rmaxx=round(max(rmax),1),holes=int(holes),edge_alpha=int(max(al[0].max(),al[-1].max(),al[:,0].max(),al[:,-1].max())),semi=int(semi)))
for r in res: print(r)

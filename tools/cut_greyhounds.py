"""Cut the six greyhound run cycles from the concept sheet (references/animation_concept_NOT_ATLAS.png).
Keys the purple panel and the baked-in shadows; keeps one connected dog per cell."""
from PIL import Image
import numpy as np, json, sys
from scipy import ndimage as ndi
SRC='/home/claude/grey-handoff/references/animation_concept_NOT_ATLAS.png'
im=np.array(Image.open(SRC).convert('RGB')).astype(int)
R,G,B=im[...,0],im[...,1],im[...,2]
purple=(B-G>=7)&(B>=R-10)&(np.maximum(R,B)<120)
ROWS=[(176,252),(290,368),(403,486),(516,598),(628,708),(740,818)]
X0,X1=160,915
dogs=[]
for r,(y0,y1) in enumerate(ROWS):
    sub=~purple[y0:y1,X0:X1]
    sub=ndi.binary_opening(sub,iterations=1)
    lab,n=ndi.label(sub)
    sizes=ndi.sum(sub,lab,range(1,n+1))
    comps=[]
    for i in np.argsort(sizes)[::-1][:20]:
        ys,xs=np.where(lab==i+1)
        if sizes[i]<400: continue
        comps.append((xs.min(),i+1,sizes[i]))
    comps.sort()
    # merge pieces into 8 cells by x position (cell width ~94)
    cells=[[] for _ in range(8)]
    for xmin,i,sz in comps:
        ys,xs=np.where(lab==i); cx=(xs.min()+xs.max())/2
        k=int(cx//94.4); cells[min(k,7)].append(i)
    row=[]
    for k,ids in enumerate(cells):
        m=np.isin(lab,ids); m=ndi.binary_fill_holes(ndi.binary_closing(m,iterations=1))&~purple[y0:y1,X0:X1]
        ys,xs=np.where(m)
        row.append(dict(mask=m,bbox=(xs.min(),ys.min(),xs.max(),ys.max()),px=int(m.sum())))
    dogs.append((y0,row))
    print('row',r+1,[ (d['bbox'],d['px']) for d in row])
np.save('/home/claude/grey-work/cuts.npy',np.array([[ (y0,d['bbox']) for d in row] for y0,row in dogs],dtype=object),allow_pickle=True)
# preview on light background
pv=Image.new('RGB',(X1-X0,sum(y1-y0 for y0,y1 in ROWS)),(200,230,200)); yy=0
for (y0,row),(a,b) in zip(dogs,ROWS):
    tile=np.full((b-a,X1-X0,3),(200,230,200))
    for d in row:
        m=d['mask']; tile[m]=im[a:b,X0:X1][m]
    pv.paste(Image.fromarray(tile.astype(np.uint8)),(0,yy)); yy+=b-a
pv.resize((pv.width*2,pv.height*2),Image.NEAREST).save('/home/claude/grey-work/keyed_preview.png')

# ---- distinctness and loop order (legs: lower part of each dog, aligned on the nose) ----
import itertools
def leg_mask(d):
    x0,y0,x1,y1=d['bbox']; m=d['mask'][y0:y1+1,x0:x1+1]
    W=100;H=52
    c=np.zeros((H,W),bool)
    # align right edge (nose) and top of back
    h=min(H,m.shape[0]); w=min(W,m.shape[1])
    c[:h,W-w:]=m[:h,m.shape[1]-w:]
    return c[int(H*0.5):]
report={}
for r,(y0,row) in enumerate(dogs):
    L=[leg_mask(d) for d in row]
    D=np.array([[ (a^b).sum()/max(1,(a|b).sum()) for b in L] for a in L])
    mind=min(D[i,j] for i in range(8) for j in range(8) if i<j)
    given=sum(D[i,(i+1)%8] for i in range(8))
    best=min(itertools.permutations(range(1,8)), key=lambda p: sum(D[a,b] for a,b in zip((0,)+p,p+(0,))))
    bestc=sum(D[a,b] for a,b in zip((0,)+best,best+(0,)))
    report[r+1]=dict(min_pair_diff=round(float(mind),3),given_loop=round(float(given),2),best_loop=round(float(bestc),2),best_order=[0]+list(best))
    print('row',r+1,report[r+1])

# ---- jacket digits ----
import colorsys
JACKET={0:'red',1:'blue',2:'white',3:'yellow',4:'orange',5:'green'}
def hsv(c):
    return np.array(colorsys.rgb_to_hsv(*(c/255.0)))
def jacket_mask(r,rgb,m):
    Rr,Gg,Bb=[rgb[...,i] for i in range(3)]
    mx=rgb.max(-1); mn=rgb.min(-1); s=(mx-mn)/np.maximum(mx,1); v=mx/255
    if r==0: j=(Rr>170)&(Gg<90)&(Bb<100)
    elif r==1: j=(Bb>150)&(Bb-Rr>60)
    elif r==2: j=(mn>200)
    elif r==3: j=(Rr>200)&(Gg>170)&(Bb<110)
    elif r==4: j=(Rr>215)&(Gg>80)&(Gg<170)&(Bb<110)&(s>0.6)
    else: j=(Gg>120)&(Gg-Rr>50)&(Gg-Bb>30)
    j&=m
    lab,n=ndi.label(j)
    if n==0: return j
    sz=ndi.sum(j,lab,range(1,n+1)); j=lab==(np.argmax(sz)+1)
    return ndi.binary_fill_holes(ndi.binary_closing(j,iterations=2))&m
def digit_mask(r,rgb,jm):
    mn=rgb.min(-1); mx=rgb.max(-1)
    inner=ndi.binary_erosion(jm,iterations=1)
    if r in (2,3): d=(mx<95)
    elif r==4: d=(rgb[...,0]>235)&(rgb[...,1]>150)&(rgb[...,2]>85)   # the orange jacket's pale-orange digit
    else: d=(mn>165)
    return d&inner
frames={}
for r,(y0,row) in enumerate(dogs):
    for k,d in enumerate(row):
        rgb=im[y0:y0+d['mask'].shape[0],X0:X1]
        jm=jacket_mask(r,rgb,d['mask']); dm=digit_mask(r,rgb,jm)
        frames[(r,k)]=dict(jm=jm,dm=dm,rgb=rgb)
def centred(dm,size=20):
    ys,xs=np.where(dm); c=np.zeros((size,size),bool)
    if len(ys)==0: return c
    cy,cx=int(round(ys.mean())),int(round(xs.mean()))
    for y,x in zip(ys,xs):
        yy,xx=y-cy+size//2,x-cx+size//2
        if 0<=yy<size and 0<=xx<size: c[yy,xx]=True
    return c
DONOR={0:1,1:1,2:1,3:1,4:1,5:0}
for r in range(6):
    ref=centred(frames[(r,DONOR[r])]['dm'])
    ious=[]
    for k in range(8):
        c=centred(frames[(r,k)]['dm']); ious.append(round(float((c&ref).sum()/max(1,(c|ref).sum())),2))
    print('digits row',r+1,'px',[int(frames[(r,k)]['dm'].sum()) for k in range(8)],'iou vs donor',ious)

# ---- atlas: uniform cells, aligned on the jacket, row baseline kept ----
CW,CH=104,60
atlas=np.zeros((CH*6,CW*8,4),np.uint8)
meta={'cell':[CW,CH],'lanes':6,'framesPerLane':8,'frameOrder':'as supplied (stride, extend, airborne, reach, contact, push, recover, stride)','jacket':{}}
from PIL import ImageDraw
pvw=Image.new('RGB',(CW*8*3,CH*6*3),(200,230,200))
for r,(y0,row) in enumerate(dogs):
    feet=np.median([d['bbox'][3] for d in row])
    anchors=[]
    for k,d in enumerate(row):
        f=frames[(r,k)]; jm=f['jm']
        ys,xs=np.where(jm); jx,jy=xs.mean(),ys.mean()
        # digit centre where found, else jacket centre
        dys,dxs=np.where(f['dm'])
        ax,ay=(dxs.mean(),dys.mean()) if len(dys)>=8 else (jx,jy)
        ox=int(round(CW*0.52-jx)); oy=int(round(CH-5-feet))
        m=d['mask']; rgb=f['rgb']
        ys,xs=np.where(m)
        for y,x in zip(ys,xs):
            ty,tx=y+oy,x+ox
            if 0<=ty<CH and 0<=tx<CW:
                atlas[r*CH+ty,k*CW+tx,:3]=rgb[y,x]; atlas[r*CH+ty,k*CW+tx,3]=255
        anchors.append([round(float(ax+ox),1),round(float(ay+oy),1)])
    meta['jacket'][str(r+1)]=anchors
# Hand-measured number spots where the orange dog's pale digit can't be detected reliably.
for k,(x,y) in {0:(62.4,23.0),1:(56.4,23.7),4:(56.0,23.7),7:(45.8,25.8)}.items(): meta['jacket']['5'][k]=[x,y]
Image.fromarray(atlas,'RGBA').save('/home/claude/grey-work/greyhounds_run.png')
json.dump(meta,open('/home/claude/grey-work/greyhounds_run.json','w'),indent=1)
# preview with number-patch boxes at 3x
big=Image.fromarray(atlas,'RGBA').resize((CW*8*3,CH*6*3),Image.NEAREST)
pvw.paste(big,(0,0),big); dr=ImageDraw.Draw(pvw)
for r in range(6):
    for k,(ax,ay) in enumerate(meta['jacket'][str(r+1)]):
        cx,cy=(k*CW+ax)*3,(r*CH+ay)*3
        dr.rectangle([cx-15,cy-17,cx+15,cy+17],outline=(255,0,255),width=2)
        dr.line([(k*CW*3,(r*CH+CH-5)*3),((k+1)*CW*3,(r*CH+CH-5)*3)],fill=(0,0,255))
pvw.save('/home/claude/grey-work/atlas_check.png')
print('atlas', atlas.shape)

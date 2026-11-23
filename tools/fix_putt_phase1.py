"""Rebuild Ryan's phase-1 putting frames: the author's approved putting reference supplies the head;
enclosed checkerboard left in the body (e.g. the chunk at the back of the shirt) is filled from neighbours.
Arms, putter and legs stay the contact-sheet stroke."""
import numpy as np, json, sys
from PIL import Image
from scipy import ndimage as ndi
ATL=sys.argv[1]; OUTP=sys.argv[2]; JS=sys.argv[3]
m=json.load(open(JS)); atlas=np.array(Image.open(ATL).convert('RGBA')); ref=np.array(Image.open(sys.argv[4] if len(sys.argv)>4 else 'tools/putt_phase1_ref_small.png'))
def skin(a): r,g,b=[a[...,i].astype(int) for i in range(3)]; return (a[...,3]>0)&(r>170)&(r-b>60)&(g>90)&(g<200)
def navy(a): r,g,b=[a[...,i].astype(int) for i in range(3)]; return (a[...,3]>0)&(b>70)&(b-r>30)&(r<90)
def geom(a):
    al=a[...,3]>0; ys,xs=np.nonzero(al); top=ys.min(); nv=navy(a)
    collar=[y for y in range(top,top+60) if nv[y].sum()>=3][0]
    sk=skin(a); hd=np.zeros_like(al); hd[top:collar]=True
    return collar, np.nonzero((sk&hd).any(0))[0].max()
rc,rf=geom(ref); refhead=ref[:rc]
marks=[]
for f in m['frames']['putt']:
    a=atlas[f['y']:f['y']+f['h'],f['x']:f['x']+f['w']].copy(); H,W=a.shape[:2]
    c,fx=geom(a); dx,dy=fx-rf,c-rc
    # 1. clear the old head (rows above the collar), paste the reference head
    a[:c]=0
    for y in range(refhead.shape[0]):
        ty=y+dy
        if ty<0 or ty>=H: continue
        for x in range(refhead.shape[1]):
            tx=x+dx
            if 0<=tx<W and refhead[y,x,3]: a[ty,tx]=refhead[y,x]
    # 2. join neck to collar: fill small transparent gaps in the band around the collar line
    al=a[...,3]>0; band=np.zeros_like(al); band[max(0,c-4):c+3]=True
    closed=ndi.binary_closing(al,structure=np.ones((3,3)),iterations=2)&band&~al
    # torso (collar to just below the belt): the arm overlaps the body side-on, so see-through gaps there are keyed checkerboard
    torso=np.zeros_like(al); torso[c:c+52]=True
    tc=ndi.binary_fill_holes(ndi.binary_closing(al,structure=np.ones((3,3)),iterations=3))&torso&~al
    # only gaps bounded by the figure on both sides of the row (never extend the outline)
    for y in range(c,min(H,c+52)):
        xs=np.nonzero(al[y])[0]
        if len(xs)<2: tc[y]=False; continue
        row=np.zeros(W,bool); row[xs.min():xs.max()+1]=True; tc[y]&=row
    closed|=tc
    # 3. checkerboard left inside the body (both checker greys, enclosed)
    rgb=a[...,:3].astype(int); al=a[...,3]>0
    chk=(((rgb==170).all(2))|((rgb==221).all(2)))&al
    lab,n=ndi.label(chk,structure=np.ones((3,3))); kill=np.zeros_like(chk)
    for i in range(1,n+1):
        comp=lab==i; vals=set(map(int,rgb[comp][:,0]))
        if len(vals)>1 or comp.sum()>=4: kill|=comp
    fill=closed|kill
    good=(a[...,3]>0)&~kill
    _,(iy,ix)=ndi.distance_transform_edt(~good,return_indices=True)
    a[fill,:3]=a[iy[fill],ix[fill],:3]; a[fill,3]=255
    atlas[f['y']:f['y']+f['h'],f['x']:f['x']+f['w']]=a
    marks.append((int(closed.sum()),int(kill.sum()),dx,dy))
Image.fromarray(atlas,'RGBA').save(OUTP); print(marks)

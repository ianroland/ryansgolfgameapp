"""Arm-only overlay for Monique's reach frames (8, 9, 10): her own pixels, nothing redrawn.
Below the table's back rail, keep only the sleeve/skin piece connected to the reaching hand."""
from PIL import Image
import numpy as np
from scipy import ndimage as ndi
src=np.array(Image.open('src/assets/casino/monique_table.png').convert('RGBA')).astype(int)
import sys
cw,ch=200,210
# Cell row where the table's top edge (table y 70) crosses her: (70 - MONIQUE_AT.top) / scale, less a small margin.
RAIL=int(sys.argv[1]) if len(sys.argv)>1 else 94
out=np.zeros((ch,cw*3,4),np.uint8)
for k,f in enumerate((8,9,10)):
    c=src[:,f*cw:(f+1)*cw]; R,G,B,A=[c[...,i] for i in range(4)]
    yy,xx=np.mgrid[0:ch,0:cw]
    armish=(A>0)&(((R+G+B)>300)|((R>130)&(R>G)&(G>B)))
    m=armish&(yy>=RAIL)&(xx>=88)
    m=ndi.binary_closing(m,structure=np.ones((3,3)),iterations=2)&(A>0)&(yy>=RAIL)&(xx>=88)
    lab,n=ndi.label(m)
    ids=set(np.unique(lab[(xx>=160)&m]))-{0}
    keep=ndi.binary_fill_holes(np.isin(lab,list(ids)))&(A>0)
    # vest buttons (gold, with their dark rims) sit left of the arm: drop them there only
    gold=(R>190)&(G>120)&(B<80)&(xx<132)
    gold=ndi.binary_dilation(gold,iterations=2)&((R+G+B<240)|gold)&(xx<132)
    keep&=~gold
    lab,n=ndi.label(keep); sz=ndi.sum(keep,lab,range(1,n+1))
    keep=np.isin(lab,[i+1 for i,s in enumerate(sz) if s>=25])
    o=c.copy(); o[...,3]=np.where(keep,255,0); out[:,k*cw:(k+1)*cw]=o.astype(np.uint8)
Image.fromarray(out,'RGBA').save('src/assets/casino/monique_arm.png')

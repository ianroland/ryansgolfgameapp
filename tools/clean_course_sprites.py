"""Clean the alpha course sprites: peel the light-grey checkerboard fringe off the outline
(up to 3 passes, only low-saturation light pixels touching transparency), drop specks."""
from PIL import Image
import numpy as np, os, json
from scipy import ndimage as ndi
SRC='/home/claude/course-pack/sprites'; OUT='/home/claude/course-work/clean'
report={}
for f in sorted(os.listdir(SRC)):
    a=np.array(Image.open(f'{SRC}/{f}').convert('RGBA')); rgb=a[...,:3].astype(int); al=a[...,3].copy()
    sat=rgb.max(-1)-rgb.min(-1); light=rgb.min(-1)
    checker=(sat<18)&(light>140)
    removed=0
    for _ in range(3):
        z=al==0; zp=np.pad(z,1,constant_values=True)
        edge=(al>0)&(zp[2:,1:-1]|zp[:-2,1:-1]|zp[1:-1,2:]|zp[1:-1,:-2])
        kill=edge&checker
        if not kill.any(): break
        al[kill]=0; removed+=int(kill.sum())
    lab,n=ndi.label(al>0); sz=ndi.sum(al>0,lab,range(1,n+1))
    specks=[i+1 for i,s in enumerate(sz) if s<8]
    sp=int(np.isin(lab,specks).sum()); al[np.isin(lab,specks)]=0
    a[...,3]=al
    # remaining suspect fringe
    z=al==0; zp=np.pad(z,1,constant_values=True)
    edge=(al>0)&(zp[2:,1:-1]|zp[:-2,1:-1]|zp[1:-1,2:]|zp[1:-1,:-2])
    left=int((edge&checker).sum())
    Image.fromarray(a,'RGBA').save(f'{OUT}/{f}')
    report[f]=dict(fringe_removed=removed,specks_removed=sp,fringe_left=left)
    print(f'{f:28s} removed {removed:5d} fringe px, {sp:3d} speck px, left {left}')
json.dump(report,open(f'{OUT}/cleanup_report.json','w'),indent=1)

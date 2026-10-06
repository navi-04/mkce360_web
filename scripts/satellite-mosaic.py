#!/usr/bin/env python3
"""
Rebuild the overview ground texture public/textures/campus-map.jpg from
  - assets/campus-map.png            the base satellite image (north is up, 0.792 m per pixel)
  - assets/satellite/*.png           zoomed satellite crops (any rotation or zoom; Street View frames are skipped)

Every crop is registered to the base image with SIFT features and a RANSAC similarity transform, then all
images are blended onto one north-up grid (higher resolution wins in the overlaps, edges are feathered).

This is a dev tool. It is NOT part of `npm run build`; the generated JPG is committed.
Needs:  pip install opencv-python-headless numpy
Usage:  python scripts/satellite-mosaic.py            (writes the JPG and prints the "satellite" block for campus.json)
        python scripts/satellite-mosaic.py --width 1600 --report
Paste the printed block over "satellite" in src/data/campus.json (keep the "northUp" key).
"""
import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets' / 'campus-map.png'
CROPS = ROOT / 'assets' / 'satellite'
OUT = ROOT / 'public' / 'textures' / 'campus-map.jpg'
M_PER_PX = 0.792            # base image scale (from building 1 = 113 x 92 m), see docs/blueprint-extraction.md
GATE_PX = (497, 128)        # main gate in the base image
GRASS_RGB = (75, 115, 44)   # colour of the rendered grass plane: the margins of the texture blend into it
MIN_INLIERS = 25


def load(path):
    return cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)


def features(im):
    g = cv2.createCLAHE(2.0, (8, 8)).apply(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.02).detectAndCompute(g, None)


def register(src, dst):
    """Similarity transform (3x3) taking src pixels to dst pixels, and the RANSAC inlier count."""
    (ka, da), (kb, db) = src, dst
    if da is None or db is None:
        return None, 0
    pairs = cv2.BFMatcher().knnMatch(da, db, k=2)
    good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < 0.8 * p[1].distance]
    if len(good) < 8:
        return None, 0
    pa = np.float32([ka[g.queryIdx].pt for g in good])
    pb = np.float32([kb[g.trainIdx].pt for g in good])
    m, inl = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=6.0, maxIters=5000)
    if m is None:
        return None, 0
    return np.vstack([m, [0, 0, 1]]), int(inl.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--width', type=int, default=1280, help='output width in pixels')
    ap.add_argument('--quality', type=int, default=80, help='JPEG quality')
    ap.add_argument('--skip', default='college front', help='skip crops whose file name starts with this (Street View frames)')
    ap.add_argument('--report', action='store_true', help='print the registration of every crop')
    a = ap.parse_args()

    names = ['base'] + sorted(p.stem for p in CROPS.glob('*.png') if not p.stem.startswith(a.skip))
    paths = {'base': BASE, **{p.stem: p for p in CROPS.glob('*.png')}}
    images = {n: load(paths[n]) for n in names}
    feats = {n: features(im) for n, im in images.items()}

    # crop -> base transforms, chained through an already registered crop when the direct match is weak
    to_base = {'base': np.eye(3)}
    pending = [n for n in names if n != 'base']
    for n in pending:
        t, inl = register(feats[n], feats['base'])
        if t is not None and inl >= MIN_INLIERS:
            to_base[n] = t
        if a.report:
            print(f'{n:45s} -> base  inliers {inl}')
    for _ in range(len(pending)):
        for n in pending:
            if n in to_base:
                continue
            best = None
            for m, tb in to_base.items():
                if m == 'base':
                    continue
                t, inl = register(feats[n], feats[m])
                if t is not None and inl >= MIN_INLIERS and (best is None or inl > best[0]):
                    best = (inl, tb @ t)
            if best:
                to_base[n] = best[1]
                if a.report:
                    print(f'{n:45s} -> chained, inliers {best[0]}')
    missing = [n for n in pending if n not in to_base]
    if missing:
        print('could not register (left out):', ', '.join(missing), file=sys.stderr)

    # extent of everything, in base-image pixels
    pts = []
    for n, t in to_base.items():
        h, w = images[n].shape[:2]
        c = np.array([[0, 0, 1], [w, 0, 1], [w, h, 1], [0, h, 1]], float).T
        pts.append((t @ c)[:2].T)
    pts = np.vstack(pts)
    x0, y0 = np.floor(pts.min(0))
    x1, y1 = np.ceil(pts.max(0))
    mpp = (x1 - x0) * M_PER_PX / a.width
    width, height = a.width, int(round((y1 - y0) * M_PER_PX / mpp))
    s = M_PER_PX / mpp                                    # output pixels per base pixel
    grid = np.array([[s, 0, -x0 * s], [0, s, -y0 * s], [0, 0, 1]])

    acc = np.zeros((height, width, 3), np.float32)
    wsum = np.zeros((height, width), np.float32)
    # a smaller scale factor (crop px -> base px) means finer detail; those blend on top
    order = sorted(to_base, key=lambda n: -abs(np.linalg.det(to_base[n][:2, :2])))
    for rank, n in enumerate(order):
        im = images[n]
        h, w = im.shape[:2]
        valid = np.full((h, w), 255, np.uint8)
        valid[:4, :] = valid[-4:, :] = 0
        valid[:, :4] = valid[:, -4:] = 0
        if n != 'base':
            valid[max(h - 90, 0):, max(w - 100, 0):] = 0   # map-viewer pegman / controls
        m = (grid @ to_base[n])[:2]
        wi = cv2.warpAffine(im, m, (width, height), flags=cv2.INTER_CUBIC)
        wv = cv2.warpAffine(valid, m, (width, height), flags=cv2.INTER_NEAREST)
        feather = np.clip(cv2.distanceTransform((wv > 0).astype(np.uint8), cv2.DIST_L2, 3) / 14.0, 0, 1) * (1 + rank * 3.0)
        feather[wv == 0] = 0
        acc += wi.astype(np.float32) * feather[..., None]
        wsum += feather
    cover = wsum > 0
    out = np.zeros_like(acc)
    out[cover] = acc[cover] / wsum[cover][:, None]
    fill = np.array(GRASS_RGB[::-1], np.float32)
    soft = cv2.GaussianBlur(cover.astype(np.float32), (0, 0), 6)[..., None]
    out = np.clip(out * soft + fill * (1 - soft), 0, 255).astype(np.uint8)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cv2.imencode('.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, a.quality])[1].tofile(str(OUT))

    cx = ((x0 + x1) / 2 - GATE_PX[0]) * M_PER_PX
    cz = ((y0 + y1) / 2 - GATE_PX[1]) * M_PER_PX
    block = {
        'url': 'textures/campus-map.jpg',
        'pixelSize': [width, height],
        'metresPerPixel': round(mpp, 4),
        'gatePixel': [round((GATE_PX[0] - x0) * s, 1), round((GATE_PX[1] - y0) * s, 1)],
        'centre': {'x': round(cx, 1), 'z': round(cz, 1)},
        'size': {'w': round(width * mpp, 1), 'd': round(height * mpp, 1)},
        'northUp': True,
    }
    print(f'wrote {OUT.relative_to(ROOT)}  {OUT.stat().st_size // 1024} KB  {width}x{height}  {mpp:.3f} m/px  ({len(to_base) - 1} crops used)')
    print(json.dumps(block, indent=2))


if __name__ == '__main__':
    main()

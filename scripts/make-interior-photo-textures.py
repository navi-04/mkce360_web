#!/usr/bin/env python
"""
Cuts the seamless ground and bark textures of the block 1 courtyard out of the photos in
assets/inside of APJ Block (git-ignored; they are the user's photos) and writes small JPEGs into
public/textures/interior/. The app loads them at start-up and falls back to canvas textures if they are missing.

    python scripts/make-interior-photo-textures.py

Needs Python with OpenCV and NumPy (pip install opencv-python numpy).
Only ground, paving and bark are used: no people, no signs, no text.
"""
import os
import sys
import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets', 'inside of APJ Block')
OUT = os.path.join(ROOT, 'public', 'textures', 'interior')
os.makedirs(OUT, exist_ok=True)


def load(name):
    p = os.path.join(SRC, name)
    im = cv2.imread(p)
    if im is None:
        sys.exit(f'missing photo: {p}')
    return im


def tileable(img, axes=(0, 1)):
    """Make an image repeat without a seam: cross-fade it with a copy shifted by half its size."""
    h, w = img.shape[:2]
    out = img.astype(np.float32)
    shifted = out.copy()
    mask = np.ones((h, w), np.float32)
    if 1 in axes:
        shifted = np.roll(shifted, w // 2, axis=1)
        x = np.linspace(0, 1, w, dtype=np.float32)
        mask *= (1 - np.abs(2 * x - 1))[None, :] ** 0.7
    if 0 in axes:
        shifted = np.roll(shifted, h // 2, axis=0)
        y = np.linspace(0, 1, h, dtype=np.float32)
        mask *= (1 - np.abs(2 * y - 1))[:, None] ** 0.7
    mask = mask[:, :, None]
    return np.clip(out * mask + shifted * (1 - mask), 0, 255).astype(np.uint8)


def save(name, img, quality=82):
    p = os.path.join(OUT, name)
    cv2.imwrite(p, img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    print(f'{name}: {img.shape[1]}x{img.shape[0]}, {os.path.getsize(p) // 1024} KB')


# ---- grass with fallen leaves (photo 2.34.15 PM, foreground lawn) ----
lawn = load('WhatsApp Image 2026-10-06 at 2.34.15 PM.jpeg')[830:1190, 330:690]
lawn = cv2.resize(lawn, (512, 512), interpolation=cv2.INTER_CUBIC)
save('lawn.jpg', tileable(lawn))

# ---- hexagonal pavers: straighten a patch of the path (photo 2.34.13 PM (1)) ----
path = load('WhatsApp Image 2026-10-06 at 2.34.13 PM (1).jpeg')
src = np.float32([[640, 1360], [1040, 1360], [1125, 1470], [662, 1470]])
W, H = 400, 240
M = cv2.getPerspectiveTransform(src, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
patch = cv2.warpPerspective(path, M, (W, H), flags=cv2.INTER_CUBIC)
patch = cv2.resize(patch[:, 60:340], (256, 256), interpolation=cv2.INTER_CUBIC)  # 280 x 240 px of pavers
save('paver.jpg', tileable(patch), 85)

# ---- bark (the trunk in photo 2.34.14 PM (1)); tiles along the trunk ----
bark = load('WhatsApp Image 2026-10-06 at 2.34.14 PM (1).jpeg')[340:650, 712:752]  # only the trunk, nothing behind it
bark = cv2.resize(bark, (64, 256), interpolation=cv2.INTER_CUBIC)
bark = np.clip(bark.astype(np.float32) * 1.3, 0, 255).astype(np.uint8)  # the photo is shaded; the 3D scene is lit separately
save('bark.jpg', tileable(bark, axes=(0,)), 85)

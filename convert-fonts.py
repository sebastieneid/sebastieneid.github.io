"""One-off script: convert the local Switzer .otf files to .woff2 for the web.
Run once with: py convert-fonts.py
Safe to delete after running (the .woff2 outputs in fonts/ are what the site actually uses).
"""
import os
from fontTools.ttLib import TTFont

SRC_DIR = r"C:\Users\sebas\AppData\Local\Microsoft\Windows\Fonts"
DEST_DIR = os.path.join(os.path.dirname(__file__), "fonts")

WEIGHTS = [
    "Switzer-Thin", "Switzer-ThinItalic",
    "Switzer-Extralight", "Switzer-ExtralightItalic",
    "Switzer-Light", "Switzer-LightItalic",
    "Switzer-Regular", "Switzer-Italic",
    "Switzer-Medium", "Switzer-MediumItalic",
    "Switzer-Semibold", "Switzer-SemiboldItalic",
    "Switzer-Bold", "Switzer-BoldItalic",
    "Switzer-Extrabold", "Switzer-ExtraboldItalic",
]

os.makedirs(DEST_DIR, exist_ok=True)

for name in WEIGHTS:
    src = os.path.join(SRC_DIR, f"{name}.otf")
    dest = os.path.join(DEST_DIR, f"{name}.woff2")
    if not os.path.exists(src):
        print(f"SKIP (not found): {src}")
        continue
    font = TTFont(src)
    font.flavor = "woff2"
    font.save(dest)
    print(f"OK: {name}.woff2")

print("Done.")

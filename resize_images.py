#!/usr/bin/env python3
"""
Resizes and compresses images for faster web loading, while keeping
the EXACT original filenames - this matters because gallery.json
matches each gallery slot to an image by its exact filename (case,
spacing, and all).

Originals are never touched - resized copies go into a new folder.

SETUP (one time):
    pip install Pillow

USAGE:
    1. Put this script in the same folder as your CoriolanusPhotos folder
       (i.e., one level above it).
    2. Edit SOURCE_FOLDER below if your folder is named differently.
    3. Run: python3 resize_images.py
    4. Check the new folder it creates, then swap it in for the original
       (rename CoriolanusPhotos -> CoriolanusPhotos_original, then rename
       CoriolanusPhotos_resized -> CoriolanusPhotos) before committing.
"""

from PIL import Image
import os

SOURCE_FOLDER = "CoriolanusPhotos"
OUTPUT_FOLDER = "CoriolanusPhotos_resized"
MAX_DIMENSION = 1600   # longest side, in pixels - plenty sharp for on-screen viewing
JPEG_QUALITY = 82      # 1-95; 82 is a good size/quality balance


def main():
    if not os.path.isdir(SOURCE_FOLDER):
        print(f"Couldn't find a folder named '{SOURCE_FOLDER}' here.")
        print("Make sure this script sits next to that folder, or edit SOURCE_FOLDER above.")
        return

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    files = [f for f in os.listdir(SOURCE_FOLDER)
             if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    files.sort()
    print(f"Found {len(files)} images in {SOURCE_FOLDER}\n")

    total_before = 0
    total_after = 0

    for i, filename in enumerate(files, 1):
        src_path = os.path.join(SOURCE_FOLDER, filename)
        dst_path = os.path.join(OUTPUT_FOLDER, filename)  # exact same filename, always

        before_size = os.path.getsize(src_path)
        total_before += before_size

        with Image.open(src_path) as img:
            img = img.convert("RGB")  # normalizes any CMYK/PNG-alpha oddities
            width, height = img.size
            if max(width, height) > MAX_DIMENSION:
                if width > height:
                    new_size = (MAX_DIMENSION, round(height * MAX_DIMENSION / width))
                else:
                    new_size = (round(width * MAX_DIMENSION / height), MAX_DIMENSION)
                img = img.resize(new_size, Image.LANCZOS)
            img.save(dst_path, "JPEG", quality=JPEG_QUALITY, optimize=True)

        after_size = os.path.getsize(dst_path)
        total_after += after_size

        print(f"[{i}/{len(files)}] {filename}: {before_size/1024:,.0f}KB -> {after_size/1024:,.0f}KB")

    print()
    print(f"Total: {total_before/1024/1024:.1f}MB -> {total_after/1024/1024:.1f}MB")
    print(f"Resized copies are in: {OUTPUT_FOLDER}/")
    print("Review them, then swap that folder in for the original before committing.")


if __name__ == "__main__":
    main()

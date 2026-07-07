"""
OCR DSE Past Papers using Google Cloud Vision API.
Converts scanned PDF pages to images, sends to Vision API, saves extracted text.
"""
import os
import io
import time
import fitz  # PyMuPDF — converts PDF pages to images
from google.cloud import vision
from google.oauth2 import service_account

# ============================================================
# CONFIGURATION
# ============================================================
SERVICE_ACCOUNT_KEY = r"c:\Users\TC-37\OneDrive - PO CHIU CATHOLIC SECONDARY SCHOOL\AI\歷史科改卷助手\gcp-service-account.json"
MATERIALS_DIR = r"c:\Users\TC-37\OneDrive - PO CHIU CATHOLIC SECONDARY SCHOOL\AI\AI English Platform\materials"
OUTPUT_DIR = os.path.join(MATERIALS_DIR, "_extracted")

# Files to OCR (relative to MATERIALS_DIR)
TARGET_FILES = [
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 DSE ENG_Part A_Q&A.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 DSE ENG_Part A_Reading Passage.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 DSE ENG_Part B1_Q&A.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 DSE ENG_Part B1_Reading Passage.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 DSE ENG_Part B2_Q&A.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 DSE ENG_Part B2_Reading Passage.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 Part A Marking Schemes.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 Part B1 Marking Schemes.pdf",
    r"2020-2025 DSE English past paper\Paper 1\2020-2025 Part B2 Marking Schemes.pdf",
    r"2020-2025 DSE English past paper\Paper 2\2020-2025 DSE ENG_Paper 2_Marking Scheme.pdf",
    r"2020-2025 DSE English past paper\Paper 2\2020-2025 DSE ENG_Paper 2_Q&A.pdf",
    r"2020-2025 DSE English past paper\Paper 2\2020-2025 DSE ENG_Paper 2_Question Only.pdf",
]

# ============================================================
# SETUP
# ============================================================
os.makedirs(OUTPUT_DIR, exist_ok=True)

credentials = service_account.Credentials.from_service_account_file(SERVICE_ACCOUNT_KEY)
client = vision.ImageAnnotatorClient(credentials=credentials)

print("Google Cloud Vision client initialized.")

# ============================================================
# OCR FUNCTIONS
# ============================================================

def ocr_image(image_bytes: bytes) -> str:
    """Send a single image to Vision API and return detected text."""
    image = vision.Image(content=image_bytes)
    response = client.text_detection(image=image)
    
    if response.error.message:
        raise Exception(f"Vision API error: {response.error.message}")
    
    annotations = response.text_annotations
    if annotations:
        return annotations[0].description or ""
    return ""


def ocr_pdf(pdf_path: str) -> str:
    """
    Convert each page of a PDF to an image, OCR it, and combine results.
    Uses PyMuPDF (fitz) for rendering — no external dependencies needed.
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    all_text: list[str] = []
    
    for page_num in range(total_pages):
        page = doc[page_num]
        
        # Render page to image at 200 DPI (good balance of quality vs API cost)
        # Higher DPI = better OCR but larger image & slower processing
        zoom = 200 / 72  # 72 is the default PDF DPI
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        
        # OCR the image
        try:
            text = ocr_image(img_bytes)
            if text.strip():
                all_text.append(f"--- Page {page_num + 1} ---\n{text}")
            else:
                all_text.append(f"--- Page {page_num + 1} ---\n[No text detected]")
        except Exception as e:
            all_text.append(f"--- Page {page_num + 1} ---\n[OCR ERROR: {e}]")
        
        # Progress indicator
        print(f"  Page {page_num + 1}/{total_pages} done ({len(text)} chars)", flush=True)
        
        # Small delay to avoid rate limiting (Vision API quota: ~1800 requests/min)
        time.sleep(0.1)
    
    doc.close()
    return "\n\n".join(all_text)


# ============================================================
# MAIN
# ============================================================

def main():
    results = []
    
    for rel_path in TARGET_FILES:
        full_path = os.path.join(MATERIALS_DIR, rel_path)
        
        if not os.path.exists(full_path):
            print(f"⚠ SKIP (not found): {rel_path}")
            continue
        
        safe_name = rel_path.replace("\\", "_").replace("/", "_")
        out_path = os.path.join(OUTPUT_DIR, safe_name + ".txt")
        
        # Skip if already done (resume support)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            print(f"⏭ SKIP (already done): {rel_path}")
            continue
        
        print(f"\n📄 OCR: {rel_path}")
        print(f"   Output: {out_path}")
        
        try:
            text = ocr_pdf(full_path)
            
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(text)
            
            char_count = len(text)
            print(f"✅ Done: {char_count:,} chars extracted")
            results.append({"file": rel_path, "chars": char_count})
            
        except Exception as e:
            print(f"❌ FAILED: {e}")
            results.append({"file": rel_path, "chars": 0, "error": str(e)})
    
    # Summary
    print("\n" + "=" * 60)
    print("OCR SUMMARY")
    print("=" * 60)
    for r in results:
        status = f"{r['chars']:,} chars" if r.get('chars') else f"ERROR: {r.get('error')}"
        print(f"  {r['file']}: {status}")


if __name__ == "__main__":
    main()

"""Extract text from all PDFs in materials/ folder and save as .txt files."""
import os
from PyPDF2 import PdfReader

MATERIALS_DIR = r"c:\Users\TC-37\OneDrive - PO CHIU CATHOLIC SECONDARY SCHOOL\AI\AI English Platform\materials"
OUTPUT_DIR = r"c:\Users\TC-37\OneDrive - PO CHIU CATHOLIC SECONDARY SCHOOL\AI\AI English Platform\materials\_extracted"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def extract_pdf(filepath):
    """Extract all text from a PDF file."""
    try:
        reader = PdfReader(filepath)
        text_parts = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text_parts.append(f"--- Page {i+1} ---\n{page_text}")
        return "\n\n".join(text_parts)
    except Exception as e:
        return f"[ERROR extracting PDF: {e}]"

def get_summary(text, max_lines=5):
    """Get first few non-empty lines as preview."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    return "\n".join(lines[:max_lines])

results = []

for root, dirs, files in os.walk(MATERIALS_DIR):
    # Skip output dir
    if "_extracted" in root:
        continue
    for f in sorted(files):
        if not f.lower().endswith(".pdf"):
            continue
        full_path = os.path.join(root, f)
        rel_path = os.path.relpath(full_path, MATERIALS_DIR)
        print(f"Extracting: {rel_path} ...", end=" ", flush=True)
        
        text = extract_pdf(full_path)
        
        # Save to output
        safe_name = rel_path.replace("\\", "_").replace("/", "_")
        out_path = os.path.join(OUTPUT_DIR, safe_name + ".txt")
        with open(out_path, "w", encoding="utf-8") as out:
            out.write(text)
        
        char_count = len(text)
        summary = get_summary(text)
        print(f"{char_count} chars")
        results.append({
            "file": rel_path,
            "chars": char_count,
            "preview": summary,
        })

# Print summary
print("\n" + "=" * 60)
print("EXTRACTION SUMMARY")
print("=" * 60)
for r in sorted(results, key=lambda x: x["chars"], reverse=True):
    print(f"\n📄 {r['file']} ({r['chars']:,} chars)")
    print(f"   Preview: {r['preview'][:120]}...")

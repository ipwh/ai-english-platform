"""Analyze student xlsx and convert to CSV for import."""
import openpyxl
import json
import os

SRC = r"C:\Users\TC-37\Desktop\25-26 Sudents' Gmail_29-8.xlsx"
OUT = r"C:\Users\TC-37\OneDrive - PO CHIU CATHOLIC SECONDARY SCHOOL\AI\AI English Platform\students_import.csv"

wb = openpyxl.load_workbook(SRC)
print(f"Sheets found: {wb.sheetnames}")

for name in wb.sheetnames:
    ws = wb[name]
    print(f"\n=== Sheet: '{name}' === Rows: {ws.max_row}, Cols: {ws.max_column}")
    headers = [str(c.value) if c.value is not None else '' for c in ws[1]]
    print(f"Headers: {headers}")

    # Show sample rows
    print("\nFirst 10 data rows:")
    for i, row in enumerate(ws.iter_rows(min_row=2, max_row=min(11, ws.max_row), values_only=True)):
        print(f"  Row {i+2}: {list(row)}")

# Try to auto-detect columns and generate CSV
print("\n\n===== AUTO-DETECTING COLUMNS =====")
ws = wb[wb.sheetnames[0]]
headers = [str(c.value).strip().lower() if c.value is not None else '' for c in ws[1]]
print(f"Lowercase headers: {headers}")

# Column mapping guesses
col_map = {}
for i, h in enumerate(headers):
    if 'email' in h or 'gmail' in h or 'mail' in h or '電郵' in h:
        col_map['email'] = i
    elif 'name' in h and ('zh' in h or '中文' in h or 'chi' in h):
        col_map['nameZh'] = i
    elif 'name' in h and ('en' in h or '英文' in h or 'eng' in h):
        col_map['nameEn'] = i
    elif 'class' in h and ('name' in h or '班' in h or 'name' in h):
        col_map['className'] = i
    elif 'class' in h and ('no' in h or 'number' in h or '號' in h or 'num' in h):
        col_map['classNumber'] = i
    elif 'level' in h or 'grade' in h or 'form' in h or '年級' in h or '級' in h:
        col_map['level'] = i
    elif 'gender' in h or 'sex' in h or '性別' in h:
        col_map['gender'] = i
    elif 'id' in h or 'student' in h or '學號' in h:
        col_map['studentId'] = i
    elif 'name' in h or '姓名' in h or '名字' in h:
        if 'nameZh' not in col_map:
            col_map['nameZh'] = i

print(f"\nDetected column mapping: {json.dumps(col_map, indent=2, ensure_ascii=False)}")
print(f"\nMissing: {[k for k in ['studentId','email','nameZh','nameEn','level','className','classNumber','gender'] if k not in col_map]}")

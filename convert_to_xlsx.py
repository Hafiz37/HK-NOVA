import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
import re

def parse_markdown_table(content):
    lines = content.strip().split('\n')
    table_lines = []
    for line in lines:
        if line.strip().startswith('|'):
            table_lines.append(line)
    
    if len(table_lines) < 2:
        return []
    
    rows = []
    for line in table_lines:
        if re.match(r'^\s*\|[\s\-:]+\|\s*$', line):
            continue
        cells = [cell.strip() for cell in line.split('|')[1:-1]]
        rows.append(cells)
    
    return rows

def create_xlsx(md_file, xlsx_file):
    with open(md_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    rows = parse_markdown_table(content)
    
    if not rows:
        print(f"No table found in {md_file}")
        return
    
    wb = openpyxl.Workbook()
    ws = wb.active
    
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    
    for row_idx, row_data in enumerate(rows, start=1):
        for col_idx, cell_value in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.value = cell_value.replace('<br>', '\n')
            cell.alignment = Alignment(wrap_text=True, vertical='top')
            
            if row_idx == 1:
                cell.fill = header_fill
                cell.font = header_font
    
    for col in ws.columns:
        max_length = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                lines = str(cell.value).split('\n')
                max_line = max(len(line) for line in lines)
                max_length = max(max_length, max_line)
        adjusted_width = min(max_length + 2, 80)
        ws.column_dimensions[col_letter].width = adjusted_width
    
    wb.save(xlsx_file)
    print(f"Created: {xlsx_file}")

create_xlsx('assets/tabel-v2/tabel_fungsional-v2.md', 'assets/tabel-v2/tabel_fungsional-v2.xlsx')
create_xlsx('assets/tabel-v2/tabel_non_fungsional-v2.md', 'assets/tabel-v2/tabel_non_fungsional-v2.xlsx')
create_xlsx('assets/tabel-v2/tabel_use_case_skenario-v2.md', 'assets/tabel-v2/tabel_use_case_skenario-v2.xlsx')

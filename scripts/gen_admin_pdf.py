"""Generate Bitloom_Admin_Accounts.pdf from backend/.env admin vars."""
from pathlib import Path
from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / "backend" / ".env"
OUT = ROOT / "Bitloom_Admin_Accounts.pdf"

def parse_env(path: Path) -> dict:
    out = {}
    for ln in path.read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("#") or "=" not in ln:
            continue
        k, _, v = ln.partition("=")
        out[k.strip()] = v.strip().strip('"')
    return out

env = parse_env(ENV)
rows = []

main_user = env.get("ADMIN_MAIN_USER", "")
main_pass = env.get("ADMIN_MAIN_PASS", "")
main_code = env.get("ADMIN_MAIN_CODE", "")
main_email = env.get("ADMIN_MAIN_EMAIL", "")
if main_user:
    rows.append(("Main", main_user, main_pass, main_code, main_email or "-", "Full access"))

for i in range(2, 19):
    user = env.get(f"ADMIN_{i}_USER", "")
    if not user:
        continue
    rows.append((
        "Limited",
        user,
        env.get(f"ADMIN_{i}_PASS", ""),
        env.get(f"ADMIN_{i}_CODE", ""),
        env.get(f"ADMIN_{i}_EMAIL", "") or "-",
        "Own referrals only",
    ))

class CredPdf(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 16)
        self.cell(0, 10, "Bitloom Admin Accounts", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 10)
        self.cell(0, 6, "Private credentials - do not share publicly", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")

pdf = CredPdf(orientation="L", format="A4")
pdf.set_auto_page_break(auto=True, margin=15)
pdf.add_page()
pdf.set_font("Helvetica", "", 10)
pdf.multi_cell(
    0,
    5,
    "Main admin has full oversight (all chats / customers). "
    "Limited admins only see customers who signed up with their referral code. "
    "Customers must enter a referral code at signup.",
)
pdf.ln(4)

cols = [22, 42, 36, 24, 58, 70]
headers = ["Role", "Username", "Password", "Code", "Email login", "Access"]
pdf.set_font("Helvetica", "B", 9)
pdf.set_fill_color(30, 30, 30)
pdf.set_text_color(255, 255, 255)
for h, w in zip(headers, cols):
    pdf.cell(w, 8, h, border=1, fill=True)
pdf.ln()
pdf.set_text_color(0, 0, 0)
pdf.set_font("Helvetica", "", 8)

for idx, (role, user, pw, code, email, access) in enumerate(rows):
    pdf.set_fill_color(245, 245, 245) if idx % 2 == 0 else pdf.set_fill_color(255, 255, 255)
    for v, w in zip([role, user, pw, code, email, access], cols):
        pdf.cell(w, 7, str(v), border=1, fill=True)
    pdf.ln()

pdf.ln(6)
pdf.set_font("Helvetica", "B", 10)
pdf.cell(0, 6, "How to use", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("Helvetica", "", 9)
howto = (
    "1. Open the site Control Desk (shield icon) and log in with username + password.\n"
    f"2. Main admin may also log in with email: {main_email or '(not set)'}\n"
    "3. Share each limited admin their Username, Password, and Referral Code.\n"
    "4. New customers must enter that referral code at signup - they can only chat with that admin."
)
pdf.multi_cell(0, 5, howto)
pdf.output(str(OUT))
print(f"Wrote {OUT} ({len(rows)} accounts)")

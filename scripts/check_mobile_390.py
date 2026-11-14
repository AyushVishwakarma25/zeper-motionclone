import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            headless=True
        )
        page = browser.new_page(viewport={"width": 390, "height": 844})
        html_path = Path(__file__).resolve().parents[1] / 'web' / 'dashboard.html'
        page.goto(html_path.as_uri())
        page.wait_for_timeout(500)

        # Inject dummy timeline scenes and open inspector to test all buttons
        page.evaluate("""() => {
            const tl = document.getElementById('timeline-sequence-scenes');
            if (tl) {
                tl.innerHTML = '<button class="btn-timeline-scene" style="width:120px;height:40px;">Shot 1</button><button class="btn-timeline-scene" style="width:120px;height:40px;">Shot 2</button>';
            }
            const inspector = document.getElementById('sidebar-inspector');
            if (inspector) inspector.classList.remove('collapsed');
        }""")
        page.wait_for_timeout(300)

        # Check all visible buttons
        buttons = page.evaluate("""() => {
            const btns = Array.from(document.querySelectorAll('button, a.btn-new-project, a.btn-icon-settings'));
            const bad = [];
            for (const b of btns) {
                const rect = b.getBoundingClientRect();
                const style = window.getComputedStyle(b);
                if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0) {
                    if (rect.right > 390.5) {
                        bad.push({
                            id: b.id,
                            className: b.className,
                            right: Math.round(rect.right),
                            width: Math.round(rect.width),
                            text: b.textContent.trim().slice(0, 25)
                        });
                    }
                }
            }
            return bad;
        }""")

        print(f"Total overflowing buttons at 390px: {len(buttons)}")
        for b in buttons:
            print(f"  button#{b['id']}.{b['className']} right={b['right']}, width={b['width']} ({b['text']})")

        page.screenshot(path="tests/fixtures/dashboard_390px.png")
        print("Screenshot written to tests/fixtures/dashboard_390px.png")
        browser.close()
        assert len(buttons) == 0, f"Found {len(buttons)} buttons overflowing 390px!"

if __name__ == '__main__':
    main()

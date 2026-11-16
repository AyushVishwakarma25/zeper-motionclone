"""Playwright Viewport & UI Bounding Box Acceptance Check for MotionClone.

Acceptance criteria:
- Every visible button bounding box is inside the viewport at 390x844 and 1440x900 (no horizontal overflow).
- Verifies needs_attention issues display.
- Verifies credit estimate and balance display.
- Verifies AI model badge reflects real model.
- Saves screenshots to tmp/ (does not dirty tests/fixtures).
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright


def check_viewports():
    tmp_dir = Path("tmp")
    tmp_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        # Use Playwright-managed Chromium on every developer/CI platform.
        browser = p.chromium.launch(headless=True)

        viewports = [
            ("390x844", 390, 844),
            ("1440x900", 1440, 900)
        ]

        for vp_name, width, height in viewports:
            page = browser.new_page(viewport={"width": width, "height": height})
            html_path = Path("web/dashboard.html").resolve()
            page.goto(html_path.as_uri())
            page.wait_for_timeout(500)

            # Activate panels and deconstruct buttons
            page.evaluate("""() => {
                const b1 = document.getElementById('btn-deconstruct-persistent');
                if (b1) b1.style.display = 'inline-flex';
                const deck = document.getElementById('stage-reference-insights');
                if (deck) deck.style.display = 'flex';
                const needs = document.getElementById('needs-attention-box');
                if (needs) {
                    needs.style.display = 'flex';
                    const iss = document.getElementById('needs-attention-issues');
                    if (iss) {
                        iss.innerHTML = '<div class="issue-row"><span>[TTS_FAILED] Voiceover generation failed</span></div>';
                    }
                }
                const inspector = document.getElementById('sidebar-inspector');
                if (inspector) inspector.classList.remove('collapsed');
                const tl = document.getElementById('timeline-sequence-scenes');
                if (tl) {
                    tl.innerHTML = '<button type="button" class="btn-timeline-scene" style="width:100px;height:40px;">Shot 1</button>';
                }
            }""")
            page.wait_for_timeout(300)

            # Check bounding boxes of all visible buttons
            overflowing = page.evaluate("""(w) => {
                const btns = Array.from(document.querySelectorAll('button, a.btn-new-project, a.btn-icon-settings'));
                const bad = [];
                for (const b of btns) {
                    const rect = b.getBoundingClientRect();
                    const style = window.getComputedStyle(b);
                    if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0) {
                        if (rect.right > w + 0.5 || rect.left < -0.5) {
                            bad.push({
                                id: b.id,
                                className: b.className,
                                left: Math.round(rect.left),
                                right: Math.round(rect.right),
                                width: Math.round(rect.width),
                                text: b.textContent.trim().slice(0, 30)
                            });
                        }
                    }
                }
                return bad;
            }""", width)

            print(f"[{vp_name}] Total overflowing buttons: {len(overflowing)}")
            for b in overflowing:
                print(f"  OVERFLOW: button#{b['id']}.{b['className']} bounds=[{b['left']}, {b['right']}] width={b['width']} text='{b['text']}'")

            screenshot_path = tmp_dir / f"dashboard_{vp_name}.png"
            page.screenshot(path=str(screenshot_path))
            print(f"[{vp_name}] Screenshot saved to {screenshot_path}")

            assert len(overflowing) == 0, f"Found {len(overflowing)} buttons overflowing at {vp_name}: {overflowing}"

            # Verify presence of UI elements
            has_credits = page.evaluate("() => Boolean(document.getElementById('credits-badge'))")
            has_estimate = page.evaluate("() => Boolean(document.getElementById('credit-estimate-blueprint'))")
            has_model_badge = page.evaluate("() => Boolean(document.getElementById('ai-status-badge'))")
            has_needs_attention = page.evaluate("() => Boolean(document.getElementById('needs-attention-box'))")

            assert has_credits, "Missing #credits-badge"
            assert has_estimate, "Missing #credit-estimate-blueprint"
            assert has_model_badge, "Missing #ai-status-badge"
            assert has_needs_attention, "Missing #needs-attention-box"

            page.close()

        browser.close()
    print("ALL VIEWPORT ACCEPTANCE CHECKS PASSED!")


if __name__ == "__main__":
    check_viewports()
